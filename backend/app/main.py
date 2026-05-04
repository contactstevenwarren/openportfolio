import math
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from sqlalchemy import Float as SAFloat
from sqlalchemy import delete, func, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from . import models  # noqa: F401  -- register models with Base before create_all
from .allocation import aggregate
from .auth import require_admin_token
from .config import settings
from .drift import apply_drift
from .rebalance import compute_new_money, compute_rebalance
from .classifications import (
    ClassificationEntry,
    load_classifications,
    load_user_classifications,
    migrate_synthetic_positions,
)
from .db import Base, SessionLocal, engine, get_db
from .llm import classify_ticker, extract_positions
from .pdf_text import PdfNoTextError, PdfTextTooLargeError, pdf_bytes_to_text
from .scrub_digits import scrub_digit_runs
from .lookthrough import Breakdown, get_yaml_breakdowns
from .models import Account, Classification, Institution, Position, Provenance, Snapshot, Target
from .schemas import (
    ASSET_CLASS_OPTIONS,
    MANUAL_ACCOUNT_TYPES,
    STALENESS_THRESHOLD_BY_TYPE,
    TAX_TREATMENTS_BROKERAGE_ONLY,
    VALID_TAX_TREATMENTS,
    AccountClassBreakdown,
    AccountCreate,
    AccountPatch,
    AccountRead,
    AllocationResult,
    BreakdownBucket,
    ClassificationPatch,
    ClassificationRow,
    ClassificationSuggestItem,
    ClassificationSuggestRequest,
    CommitPosition,
    CommitResult,
    DriftThresholds,
    ExportResult,
    ExtractionResult,
    ExtractRequest,
    FundBreakdown,
    InstitutionCreate,
    InstitutionRead,
    PositionCommit,
    PositionPatch,
    PositionRead,
    ProvenanceRead,
    RebalanceResult,
    SnapshotEarliest,
    SnapshotRead,
    TargetsPayload,
    Taxonomy,
)

_VALID_ASSET_CLASSES = {o.value for o in ASSET_CLASS_OPTIONS}

# Suffix allows A–Z so region codes like ``US`` match allocation slice names.
_TARGET_PATH_RE = re.compile(
    r"^(equity|fixed_income|real_estate|commodity|crypto|cash|private)"
    r"(\.[A-Za-z0-9_]+)?$"
)


def _slug(s: str) -> str:
    """Lowercase slug for synthetic asset tickers (real_estate / private).

    Replaces any run of non-alphanumeric chars (except . _ -) with a single
    dash, then strips leading/trailing dashes. Falls back to "item" if the
    result is empty (all-symbol label).
    """
    slug = re.sub(r"[^a-z0-9._-]+", "-", s.strip().lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "item"


def _targets_sum_ok(pcts: list[int]) -> bool:
    # Targets are integers; require exact 100 so the user's input matches
    # what's persisted (no hidden +/- rounding slop).
    return sum(pcts) == 100


def _validate_put_targets(body: TargetsPayload, result: AllocationResult) -> None:
    """Enforce the v0.2 targets contract.

    Root targets are ``% of portfolio`` and must cover every funded
    asset class; each per-group list is ``% of parent asset class`` and
    must cover every funded drill slice. Both scopes sum to exactly 100.
    """
    paths: list[str] = []
    for r in body.root:
        paths.append(r.path)
    for gkey, rows in body.groups.items():
        if gkey not in _VALID_ASSET_CLASSES:
            raise HTTPException(
                status_code=422,
                detail=f"unknown targets group key {gkey!r}",
            )
        for r in rows:
            if not r.path.startswith(f"{gkey}."):
                raise HTTPException(
                    status_code=422,
                    detail=f"path {r.path!r} must start with {(gkey + '.')!r}",
                )
            paths.append(r.path)
    if len(set(paths)) != len(paths):
        raise HTTPException(status_code=422, detail="duplicate target paths")

    for r in body.root:
        if "." in r.path:
            raise HTTPException(
                status_code=422,
                detail=f"root target path must be a single segment; got {r.path!r}",
            )

    for r in body.root:
        if not _TARGET_PATH_RE.fullmatch(r.path):
            raise HTTPException(
                status_code=422, detail=f"invalid target path {r.path!r}"
            )
    for rows in body.groups.values():
        for r in rows:
            if not _TARGET_PATH_RE.fullmatch(r.path):
                raise HTTPException(
                    status_code=422, detail=f"invalid target path {r.path!r}"
                )

    if result.total <= 0:
        if body.root or any(len(v) > 0 for v in body.groups.values()):
            raise HTTPException(
                status_code=422,
                detail="cannot set targets while the portfolio total is zero",
            )
        return

    if body.root:
        required = {s.name for s in result.by_asset_class if s.value > 0}
        if not required:
            raise HTTPException(
                status_code=422,
                detail="root targets require at least one funded asset class in allocation",
            )
        provided = {r.path for r in body.root}
        if required != provided:
            raise HTTPException(
                status_code=422,
                detail=(
                    "root targets must include every funded asset class exactly once "
                    f"(expected {sorted(required)}, got {sorted(provided)})"
                ),
            )
        if not _targets_sum_ok([r.pct for r in body.root]):
            raise HTTPException(
                status_code=422,
                detail="root targets must sum to 100",
            )

    by_name = {s.name: s for s in result.by_asset_class}
    for gkey, rows in body.groups.items():
        if not rows:
            continue
        sl = by_name.get(gkey)
        if sl is None or sl.value <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"group {gkey!r} has targets but allocation has no funded slice",
            )
        if gkey == "equity":
            required_p = {f"equity.{c.name}" for c in sl.children if c.value > 0}
        else:
            required_p = set()
            for reg in sl.children:
                for leaf in reg.children:
                    if leaf.value > 0:
                        required_p.add(f"{gkey}.{leaf.name}")
        provided_p = {r.path for r in rows}
        if required_p != provided_p:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"group {gkey!r} targets must cover every drill slice with dollars "
                    f"exactly once (expected {sorted(required_p)}, got {sorted(provided_p)})"
                ),
            )
        if not _targets_sum_ok([r.pct for r in rows]):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"group {gkey!r} targets must sum to 100 "
                    "(% of parent asset class)"
                ),
            )


def _targets_get_payload(db: Session) -> dict[str, object]:
    rows = db.query(Target).order_by(Target.path).all()
    root: list[dict[str, object]] = []
    groups: dict[str, list[dict[str, object]]] = {}
    for r in rows:
        # Round-trip as int; the column is Integer now but a pre-migration
        # read could still surface a float from an un-migrated legacy row.
        pct = int(round(float(r.pct)))
        if "." not in r.path:
            root.append({"path": r.path, "pct": pct})
        else:
            key, _rest = r.path.split(".", 1)
            groups.setdefault(key, []).append({"path": r.path, "pct": pct})
    for _k, lst in groups.items():
        lst.sort(key=lambda x: str(x["path"]))
    return {"root": root, "groups": groups}


def _migrate_sqlite_schema() -> None:
    """Thin wrapper: delegates to _migrate_schema with the module-level engine.

    Tests can call _migrate_schema(their_engine) directly to avoid touching
    the production schema (decision #17).
    """
    _migrate_schema(engine)


def _migrate_schema(eng: Engine) -> None:
    """Additive column/table migrations. All steps are idempotent.

    Called on startup via _migrate_sqlite_schema(). Tests call this
    directly with a per-test engine to inspect migration behaviour
    without affecting the production database.
    """
    inspector = inspect(eng)
    tables = inspector.get_table_names()

    # ── v0.1.5: provenance.entity_key ────────────────────────────────────────
    if "provenance" in tables:
        cols = {c["name"] for c in inspector.get_columns("provenance")}
        if "entity_key" not in cols:
            with eng.begin() as conn:
                conn.execute(
                    text("ALTER TABLE provenance ADD COLUMN entity_key VARCHAR(64)")
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_provenance_entity_key "
                        "ON provenance(entity_key)"
                    )
                )

    # ── v0.1.5: positions.investable ─────────────────────────────────────────
    if "positions" in tables:
        cols = {c["name"] for c in inspector.get_columns("positions")}
        if "investable" not in cols:
            with eng.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE positions ADD COLUMN investable BOOLEAN "
                        "NOT NULL DEFAULT 1"
                    )
                )

    # ── v0.2: targets.pct Float → Integer ───────────────────────────────────
    _migrate_targets_pct_to_int(eng)

    # ── accounts: institution_id + tax_treatment + staleness_threshold_days ───
    if "accounts" in tables:
        cols = {c["name"] for c in inspector.get_columns("accounts")}
        with eng.begin() as conn:
            if "institution_id" not in cols:
                conn.execute(
                    text("ALTER TABLE accounts ADD COLUMN institution_id INTEGER")
                )
            if "tax_treatment" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE accounts ADD COLUMN tax_treatment VARCHAR(20) "
                        "NOT NULL DEFAULT 'taxable'"
                    )
                )
            if "staleness_threshold_days" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE accounts ADD COLUMN staleness_threshold_days INTEGER "
                        "NOT NULL DEFAULT 30"
                    )
                )
            if "is_archived" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE accounts ADD COLUMN is_archived BOOLEAN "
                        "NOT NULL DEFAULT 0"
                    )
                )
        # One-shot: migrate legacy type='hsa' rows to type='brokerage' + tax_treatment='hsa'.
        # Idempotent: WHERE type='hsa' matches nothing after first run.
        with eng.begin() as conn:
            conn.execute(
                text(
                    "UPDATE accounts SET type='brokerage', tax_treatment='hsa' "
                    "WHERE type='hsa'"
                )
            )
        # Backfill type-default thresholds for rows still at the schema default (30).
        # Rows the user has already customised are untouched because their value != 30.
        with eng.begin() as conn:
            for acc_type, days in STALENESS_THRESHOLD_BY_TYPE.items():
                if days == 30:
                    continue  # schema default already correct
                conn.execute(
                    text(
                        "UPDATE accounts SET staleness_threshold_days = :days "
                        "WHERE type = :acc_type AND staleness_threshold_days = 30"
                    ),
                    {"days": days, "acc_type": acc_type},
                )

    # ── institutions: case-insensitive unique index ───────────────────────────
    # create_all handles table creation on fresh installs; this ensures the
    # unique index exists on DBs that predate the model declaration.
    with eng.begin() as conn:
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_institutions_name_lower "
                "ON institutions(lower(name))"
            )
        )

    # ── institutions: seed well-known US institutions ─────────────────────────
    # Idempotent: INSERT OR IGNORE skips any row whose lower(name) already
    # matches the unique index. Safe to run every startup.
    _seed_institutions(eng)


_WELL_KNOWN_INSTITUTIONS = [
    "Ally Bank",
    "Bank of America",
    "Capital One",
    "Charles Schwab",
    "Chase",
    "Coinbase",
    "E*TRADE",
    "Empower Retirement",
    "Fidelity",
    "Kraken",
    "Merrill Edge",
    "Robinhood",
    "SoFi",
    "TD Ameritrade",
    "Vanguard",
    "Wealthfront",
    "Wells Fargo",
]


def _seed_institutions(eng: Engine) -> None:
    """Insert well-known US institutions on first boot. Idempotent."""
    with eng.begin() as conn:
        for name in _WELL_KNOWN_INSTITUTIONS:
            conn.execute(
                text(
                    "INSERT OR IGNORE INTO institutions (name) VALUES (:name)"
                ),
                {"name": name},
            )


def _migrate_targets_pct_to_int(eng: Engine) -> None:
    """v0.2 fix: Target.pct flipped from Float to Integer.

    SQLite can't change a column's type in place, so when we find a
    legacy Float ``pct`` we copy rows out, drop the table, let
    ``create_all`` recreate it with the new Integer schema, and write
    the rows back with rounded integer pct. Idempotent: an already-
    Integer column is a no-op.
    """
    inspector = inspect(eng)
    if "targets" not in inspector.get_table_names():
        return
    pct_col = next(
        (c for c in inspector.get_columns("targets") if c["name"] == "pct"),
        None,
    )
    if pct_col is None or not isinstance(pct_col["type"], SAFloat):
        return
    with eng.begin() as conn:
        legacy = conn.execute(
            text("SELECT path, pct, updated_at FROM targets")
        ).all()
        conn.execute(text("DROP TABLE targets"))
    Target.__table__.create(bind=eng)
    if not legacy:
        return
    with eng.begin() as conn:
        for path, pct, updated_at in legacy:
            conn.execute(
                text(
                    "INSERT INTO targets (path, pct, updated_at) "
                    "VALUES (:path, :pct, :updated_at)"
                ),
                {
                    "path": path,
                    "pct": int(round(float(pct))),
                    "updated_at": updated_at,
                },
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite_schema()
    # Convert legacy synthetic-ticker positions to per-ticker
    # Classification rows so ``classify()`` can drop its prefix fallback.
    # Idempotent: rows with a Classification are skipped on re-run.
    with SessionLocal() as db:
        migrate_synthetic_positions(db)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def _account_tuples(db: Session) -> list[tuple[int, str, str]]:
    return [(a.id, a.label, a.type) for a in db.query(Account).order_by(Account.id).all()]


@app.post("/api/extract", dependencies=[Depends(require_admin_token)])
def extract(body: ExtractRequest, db: Session = Depends(get_db)) -> ExtractionResult:
    return extract_positions(body.text, accounts=_account_tuples(db))


@app.post("/api/extract/pdf", dependencies=[Depends(require_admin_token)])
def extract_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ExtractionResult:
    b = file.file.read()
    if not b.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="File is not a valid PDF (missing %PDF header).",
        )
    try:
        text = pdf_bytes_to_text(b)
    except PdfNoTextError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        ) from e
    except PdfTextTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        ) from e
    scrubbed, _redactions = scrub_digit_runs(text)
    return extract_positions(scrubbed, accounts=_account_tuples(db))


# ----- accounts -----------------------------------------------------------


def _validate_tax_treatment(account_type: str, tax_treatment: str) -> None:
    """Enforce the tax_treatment × type cross-validation matrix.

    tax_deferred / tax_free / hsa are only valid for brokerage accounts.
    taxable is valid for any type.
    """
    if tax_treatment not in VALID_TAX_TREATMENTS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"tax_treatment must be one of {sorted(VALID_TAX_TREATMENTS)}; "
                f"got {tax_treatment!r}"
            ),
        )
    if tax_treatment in TAX_TREATMENTS_BROKERAGE_ONLY and account_type != "brokerage":
        raise HTTPException(
            status_code=422,
            detail=(
                f"tax_treatment {tax_treatment!r} is only valid for type='brokerage'; "
                f"got type={account_type!r}"
            ),
        )


def _enrich_account(
    account: Account,
    classifications: dict,
    db: Session,
) -> AccountRead:
    """Build the enriched AccountRead from a raw Account ORM row."""
    positions = account.positions

    # Balance: sum of market_value, fallback to cost_basis, then 0
    balance = round(
        sum(
            p.market_value if p.market_value is not None
            else (p.cost_basis if p.cost_basis is not None else 0.0)
            for p in positions
        ),
        2,
    )

    # Last updated: max as_of, then source of that position (ORDER BY as_of DESC, id DESC)
    last_updated_at: str | None = None
    last_update_source: str | None = None
    if positions:
        latest = max(positions, key=lambda p: (p.as_of, p.id))
        last_updated_at = latest.as_of.isoformat()
        last_update_source = latest.source

    position_count = len(positions)

    # Classified position count: ticker present in the merged classification dict
    classified_position_count = sum(
        1 for p in positions if p.ticker in classifications
    )

    # class_breakdown via allocator (decision #4)
    class_breakdown: list[AccountClassBreakdown] = []
    if positions:
        result = aggregate(positions, classifications, db=db)
        class_breakdown = [
            AccountClassBreakdown(asset_class=s.name, value=round(s.value, 2))
            for s in result.by_asset_class
            if s.value > 0
        ]

    # Derived fields
    institution_name: str | None = None
    if account.institution_id is not None:
        inst = db.get(Institution, account.institution_id)
        institution_name = inst.name if inst else None

    is_manual = account.type in MANUAL_ACCOUNT_TYPES
    staleness_threshold_days = account.staleness_threshold_days

    return AccountRead(
        id=account.id,
        label=account.label,
        type=account.type,
        currency=account.currency,
        institution_id=account.institution_id,
        institution_name=institution_name,
        tax_treatment=account.tax_treatment,
        balance=balance,
        last_updated_at=last_updated_at,
        last_update_source=last_update_source,
        position_count=position_count,
        classified_position_count=classified_position_count,
        class_breakdown=class_breakdown,
        is_manual=is_manual,
        is_archived=account.is_archived,
        staleness_threshold_days=staleness_threshold_days,
    )


@app.get("/api/accounts", dependencies=[Depends(require_admin_token)])
def list_accounts(db: Session = Depends(get_db)) -> list[AccountRead]:
    accounts = db.query(Account).order_by(Account.id).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return [_enrich_account(a, classifications, db) for a in accounts]


@app.post(
    "/api/accounts",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_token)],
)
def create_account(body: AccountCreate, db: Session = Depends(get_db)) -> AccountRead:
    _validate_tax_treatment(body.type, body.tax_treatment)
    account = Account(
        label=body.label,
        type=body.type,
        institution_id=body.institution_id,
        tax_treatment=body.tax_treatment,
        staleness_threshold_days=body.staleness_threshold_days,
    )
    db.add(account)
    db.flush()  # get account.id before creating related rows

    if body.type in MANUAL_ACCOUNT_TYPES and body.initial_position is not None:
        ip = body.initial_position
        base_ticker = _slug(body.label)
        # Auto-suffix on ticker collision in the positions table
        ticker = base_ticker
        n = 2
        while db.query(Position).filter(Position.ticker == ticker).first() is not None:
            if n > 1000:
                raise HTTPException(500, "ticker namespace exhausted")
            ticker = f"{base_ticker}-{n}"
            n += 1

        as_of: datetime
        if ip.purchase_date is not None:
            as_of = datetime(ip.purchase_date.year, ip.purchase_date.month, ip.purchase_date.day, tzinfo=UTC)
        else:
            as_of = datetime.now(UTC)

        position = Position(
            account_id=account.id,
            ticker=ticker,
            shares=1.0,
            market_value=ip.market_value,
            cost_basis=ip.cost_basis,
            as_of=as_of,
            source="manual",
            investable=True,
        )
        db.add(position)

        # Upsert classification: asset_class mirrors account.type
        existing_cls = db.get(Classification, ticker)
        if existing_cls is None:
            db.add(
                Classification(
                    ticker=ticker,
                    asset_class=body.type,
                    sub_class=None,
                    sector=None,
                    region=None,
                    source="user",
                )
            )
        elif existing_cls.source == "user":
            existing_cls.asset_class = body.type

    db.commit()
    db.refresh(account)
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return _enrich_account(account, classifications, db)


@app.patch("/api/accounts/{account_id}", dependencies=[Depends(require_admin_token)])
def patch_account(
    account_id: int, body: AccountPatch, db: Session = Depends(get_db)
) -> AccountRead:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    patch_fields = body.model_dump(exclude_unset=True)
    for field, value in patch_fields.items():
        setattr(account, field, value)
    # Cross-validate after applying all patch fields
    _validate_tax_treatment(account.type, account.tax_treatment)
    db.commit()
    db.refresh(account)
    classifications = {**load_classifications(), **load_user_classifications(db)}
    return _enrich_account(account, classifications, db)


@app.delete(
    "/api/accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin_token)],
)
def delete_account(account_id: int, db: Session = Depends(get_db)) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    # D1: collect synthetic tickers before cascade-delete so we can
    # clean up orphaned Classification rows afterward.
    synthetic_tickers: list[str] = []
    if account.type in MANUAL_ACCOUNT_TYPES:
        synthetic_tickers = [p.ticker for p in account.positions]

    # Positions cascade via the Account.positions relationship
    # (cascade="all, delete-orphan") + schema-level ondelete=CASCADE on
    # Position.account_id. Provenance rows stay as an audit trail,
    # matching the delete_position behavior (v0.1 decision).
    db.delete(account)
    db.flush()  # apply cascade-delete before checking remaining positions

    # D1: for each synthetic ticker, delete its Classification row if no
    # other live position references it. Archive is NOT cleaned. Brokerage
    # deletes do NOT run this path (guarded by account.type check above).
    for ticker in synthetic_tickers:
        remaining = db.query(Position).filter(Position.ticker == ticker).count()
        if remaining == 0:
            cls_row = db.get(Classification, ticker)
            if cls_row is not None and cls_row.source == "user":
                db.delete(cls_row)

    db.commit()


# ----- institutions -------------------------------------------------------


@app.get("/api/institutions", dependencies=[Depends(require_admin_token)])
def list_institutions(db: Session = Depends(get_db)) -> list[InstitutionRead]:
    rows = db.query(Institution).order_by(func.lower(Institution.name)).all()
    return [InstitutionRead.model_validate(r) for r in rows]


@app.post("/api/institutions", dependencies=[Depends(require_admin_token)])
def create_institution(
    body: InstitutionCreate, db: Session = Depends(get_db)
) -> InstitutionRead:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name must not be empty")
    try:
        inst = Institution(name=name)
        db.add(inst)
        db.commit()
        db.refresh(inst)
        return InstitutionRead.model_validate(inst)
    except Exception:
        db.rollback()
        # Dedupe: return the existing row on case-insensitive collision
        existing = (
            db.query(Institution)
            .filter(func.lower(Institution.name) == name.lower())
            .first()
        )
        if existing:
            return InstitutionRead.model_validate(existing)
        raise


# ----- position commit ----------------------------------------------------


def _resolve_account(db: Session, account_id: int | None) -> Account:
    """Resolve the target account, auto-seeding a Default if none exist.

    Decision 1(a): when the caller doesn't specify an account and no
    accounts exist yet, we create a single "Default" brokerage so the
    first paste commit works without an explicit POST /api/accounts.
    Accounts UI lands in M3.
    """
    if account_id is not None:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {account_id} not found",
            )
        return account

    account = db.query(Account).order_by(Account.id).first()
    if account is None:
        account = Account(label="Default", type="brokerage")
        db.add(account)
        db.flush()
    return account


def _resolve_ticker(db: Session, proposed: str) -> str:
    """Auto-suffix when a Classification row already exists for ``proposed``.

    Only the manual flow carries ``classification`` payloads, which is
    when this is called. Paste commits don't pass through here -- their
    tickers are market symbols (VTI, BND) and collisions are expected
    (multiple positions share a ticker intentionally).

    ``gold-bar`` collides -> return ``gold-bar-2``; ``gold-bar-2`` also
    collides -> ``gold-bar-3``; etc.
    """
    if db.get(Classification, proposed) is None:
        return proposed
    n = 2
    while db.get(Classification, f"{proposed}-{n}") is not None:
        n += 1
    return f"{proposed}-{n}"


def _apply_commit_row_classification(
    db: Session,
    source: str,
    row: CommitPosition,
    now: datetime,
) -> str:
    """Resolve final ticker and apply the same classification writes as commit."""
    ticker = row.ticker
    if row.classification is not None:
        cls_in = row.classification
        if cls_in.asset_class not in _VALID_ASSET_CLASSES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"asset_class must be one of "
                    f"{sorted(_VALID_ASSET_CLASSES)}; "
                    f"got {cls_in.asset_class!r}"
                ),
            )
        if cls_in.auto_suffix:
            ticker = _resolve_ticker(db, ticker)
            db.add(
                Classification(
                    ticker=ticker,
                    asset_class=cls_in.asset_class,
                    sub_class=cls_in.sub_class,
                    sector=cls_in.sector,
                    region=cls_in.region,
                    source="user",
                )
            )
            for field, value in (
                ("asset_class", cls_in.asset_class),
                ("sub_class", cls_in.sub_class),
                ("sector", cls_in.sector),
                ("region", cls_in.region),
            ):
                db.add(
                    Provenance(
                        entity_type="classification",
                        entity_id=0,
                        entity_key=ticker,
                        field=field,
                        source=source,
                        confidence=1.0,
                        llm_span=None,
                        captured_at=now,
                    )
                )
        else:
            existing_c = db.get(Classification, ticker)
            yaml_entries = load_classifications()
            yaml_hit = yaml_entries.get(ticker)
            same_as_yaml = (
                yaml_hit is not None
                and yaml_hit.asset_class == cls_in.asset_class
            )
            if existing_c is not None:
                # Update the existing user-owned row with the explicitly
                # selected class. YAML-baseline rows are left alone.
                if existing_c.source == "user":
                    existing_c.asset_class = cls_in.asset_class
                    existing_c.sub_class = cls_in.sub_class
                    existing_c.sector = cls_in.sector
                    existing_c.region = cls_in.region
            elif not same_as_yaml:
                db.add(
                    Classification(
                        ticker=ticker,
                        asset_class=cls_in.asset_class,
                        sub_class=cls_in.sub_class,
                        sector=cls_in.sector,
                        region=cls_in.region,
                        source="user",
                    )
                )
            if existing_c is None or (existing_c is not None and existing_c.source == "user"):
                sc = cls_in.suggestion_confidence
                sr = cls_in.suggestion_reasoning
                for field, value in (
                    ("asset_class", cls_in.asset_class),
                    ("sub_class", cls_in.sub_class),
                    ("sector", cls_in.sector),
                    ("region", cls_in.region),
                ):
                    conf = (
                        sc
                        if field == "asset_class" and sc is not None
                        else 1.0
                    )
                    span = sr if field == "asset_class" else None
                    db.add(
                        Provenance(
                            entity_type="classification",
                            entity_id=0,
                            entity_key=ticker,
                            field=field,
                            source=source,
                            confidence=conf,
                            llm_span=span,
                            captured_at=now,
                        )
                    )
    return ticker


def _add_position_numeric_provenance(
    db: Session,
    position_id: int,
    source: str,
    confidence: float,
    source_span: str,
    now: datetime,
    shares: float,
    cost_basis: float | None,
    market_value: float | None,
) -> None:
    for field, value in (
        ("shares", shares),
        ("cost_basis", cost_basis),
        ("market_value", market_value),
    ):
        if value is None:
            continue
        db.add(
            Provenance(
                entity_type="position",
                entity_id=position_id,
                field=field,
                source=source,
                confidence=confidence,
                llm_span=source_span,
                captured_at=now,
            )
        )


@app.post(
    "/api/positions/commit",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_token)],
)
def commit_positions(
    body: PositionCommit, db: Session = Depends(get_db)
) -> CommitResult:
    now = datetime.now(UTC)

    # E1: real_estate and private accounts may only hold one position.
    # Checked before any writes so the rejection is atomic.
    if body.account_id is not None:
        target_account = db.get(Account, body.account_id)
        if target_account is not None and target_account.type in MANUAL_ACCOUNT_TYPES:
            existing_count = (
                db.query(Position)
                .filter(Position.account_id == body.account_id)
                .count()
            )
            incoming_count = len(body.positions)
            if body.replace_account:
                result_count = incoming_count
            else:
                result_count = existing_count + incoming_count
            if result_count > 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"This account may only hold one position "
                        f"(currently has {existing_count}). "
                        f"Use replace_account=true to overwrite it."
                    ),
                )

    if body.replace_account:
        if body.account_id is None:
            raise HTTPException(
                status_code=422,
                detail="replace_account requires account_id",
            )
        if not body.positions:
            raise HTTPException(
                status_code=422,
                detail="replace_account requires at least one position",
            )
        account = db.get(Account, body.account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {body.account_id} not found",
            )

        created_ids: list[int] = []
        final_tickers: list[str] = []
        for row in body.positions:
            ticker = _apply_commit_row_classification(db, body.source, row, now)

            position = (
                db.query(Position)
                .filter(
                    Position.account_id == account.id,
                    func.upper(Position.ticker) == ticker.upper(),
                )
                .first()
            )
            if position is not None:
                old_shares = position.shares
                old_cb = position.cost_basis
                old_mv = position.market_value
                position.shares = row.shares
                position.cost_basis = row.cost_basis
                position.market_value = row.market_value
                position.as_of = now
                position.source = body.source
                for field, old_v, new_v in (
                    ("shares", old_shares, row.shares),
                    ("cost_basis", old_cb, row.cost_basis),
                    ("market_value", old_mv, row.market_value),
                ):
                    if new_v is None:
                        continue
                    if old_v != new_v:
                        db.add(
                            Provenance(
                                entity_type="position",
                                entity_id=position.id,
                                field=field,
                                source=body.source,
                                confidence=row.confidence,
                                llm_span=row.source_span,
                                captured_at=now,
                            )
                        )
                created_ids.append(position.id)
                final_tickers.append(ticker)
            else:
                position = Position(
                    account_id=account.id,
                    ticker=ticker,
                    shares=row.shares,
                    cost_basis=row.cost_basis,
                    market_value=row.market_value,
                    as_of=now,
                    source=body.source,
                )
                db.add(position)
                db.flush()
                _add_position_numeric_provenance(
                    db,
                    position.id,
                    body.source,
                    row.confidence,
                    row.source_span,
                    now,
                    row.shares,
                    row.cost_basis,
                    row.market_value,
                )
                created_ids.append(position.id)
                final_tickers.append(ticker)

        committed_upper = {t.upper() for t in final_tickers}
        stale = [
            p
            for p in db.query(Position).filter_by(account_id=account.id).all()
            if p.ticker.upper() not in committed_upper
        ]
        for p in stale:
            db.delete(p)

        # Safety net: remove duplicate rows for the same ticker (keeps the
        # one that was just written, deletes any extras that pre-existed).
        seen_ids: set[int] = set(created_ids)
        for p in db.query(Position).filter_by(account_id=account.id).all():
            if p.ticker.upper() in committed_upper and p.id not in seen_ids:
                db.delete(p)

        db.commit()
        _write_snapshot(db)
        return CommitResult(
            account_id=account.id, position_ids=created_ids, tickers=final_tickers
        )

    account = _resolve_account(db, body.account_id)

    created_ids: list[int] = []
    final_tickers: list[str] = []
    for row in body.positions:
        ticker = _apply_commit_row_classification(db, body.source, row, now)

        # Upsert: if a position with this ticker already exists in the account,
        # update it instead of inserting a duplicate row.
        position = (
            db.query(Position)
            .filter(
                Position.account_id == account.id,
                func.upper(Position.ticker) == ticker.upper(),
            )
            .first()
        )
        if position is not None:
            position.shares = row.shares
            position.cost_basis = row.cost_basis
            position.market_value = row.market_value
            position.as_of = now
            position.source = body.source
        else:
            position = Position(
                account_id=account.id,
                ticker=ticker,
                shares=row.shares,
                cost_basis=row.cost_basis,
                market_value=row.market_value,
                as_of=now,
                source=body.source,
            )
            db.add(position)
            db.flush()  # populate position.id for provenance FK

        _add_position_numeric_provenance(
            db,
            position.id,
            body.source,
            row.confidence,
            row.source_span,
            now,
            row.shares,
            row.cost_basis,
            row.market_value,
        )

        created_ids.append(position.id)
        final_tickers.append(ticker)

    db.commit()

    # v0.1.5 M6: capture a deterministic snapshot of the portfolio
    # state after the commit lands so the v0.6 timeline view has real
    # history to plot. Minimal payload shape (totals by asset class +
    # equity region split) -- enough for trend lines without bloating
    # the DB on every commit.
    _write_snapshot(db)

    return CommitResult(
        account_id=account.id, position_ids=created_ids, tickers=final_tickers
    )


def _write_snapshot(db: Session) -> None:
    """Persist one Snapshot row summarising current portfolio state."""
    import json

    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(positions, classifications, db=db)

    payload = {
        "total_usd": result.total,
        "net_worth_usd": result.net_worth,
        "by_asset_class": {
            s.name: {"value": s.value, "pct": s.pct} for s in result.by_asset_class
        },
        "summary": (
            result.summary.model_dump() if result.summary is not None else None
        ),
        "unclassified_count": len(result.unclassified_tickers),
    }
    db.add(
        Snapshot(
            taken_at=datetime.now(UTC),
            net_worth_usd=result.net_worth,
            payload_json=json.dumps(payload, sort_keys=True),
        )
    )
    db.commit()


# ----- positions read / patch / delete (M3) ------------------------------


@app.get("/api/positions", dependencies=[Depends(require_admin_token)])
def list_positions(
    account_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> list[PositionRead]:
    if account_id is not None:
        if db.get(Account, account_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"account {account_id} not found",
            )
        rows = (
            db.query(Position)
            .filter(Position.account_id == account_id)
            .order_by(Position.id)
            .all()
        )
    else:
        rows = db.query(Position).order_by(Position.id).all()
    return [PositionRead.model_validate(p) for p in rows]


@app.patch("/api/positions/{position_id}", dependencies=[Depends(require_admin_token)])
def patch_position(
    position_id: int, body: PositionPatch, db: Session = Depends(get_db)
) -> PositionRead:
    position = db.get(Position, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    now = datetime.now(UTC)
    patch_fields = body.model_dump(exclude_unset=True)
    changed_numeric_fields: list[tuple[str, float | None]] = []
    for field, value in patch_fields.items():
        setattr(position, field, value)
        if field in ("shares", "cost_basis", "market_value"):
            changed_numeric_fields.append((field, value))

    # User overrides earn their own provenance row so the hover tooltip
    # makes clear the number came from a manual edit, not the paste.
    for field, value in changed_numeric_fields:
        if value is None:
            continue
        db.add(
            Provenance(
                entity_type="position",
                entity_id=position.id,
                field=field,
                source="override",
                confidence=1.0,
                llm_span=None,
                captured_at=now,
            )
        )

    db.commit()
    db.refresh(position)
    return PositionRead.model_validate(position)


@app.delete(
    "/api/positions/{position_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin_token)],
)
def delete_position(position_id: int, db: Session = Depends(get_db)) -> None:
    position = db.get(Position, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Keep provenance rows as an audit trail -- positions come and go
    # during the review/fix loop; their history shouldn't.
    db.delete(position)
    db.commit()


# ----- allocation ---------------------------------------------------------


@app.get("/api/allocation", dependencies=[Depends(require_admin_token)])
def get_allocation(db: Session = Depends(get_db)) -> AllocationResult:
    positions = db.query(Position).all()
    # YAML baseline + DB user overrides (user wins on ticker collision).
    # classify() returns an entry carrying source="yaml" or "user" which
    # the allocator surfaces per-ticker for sunburst hover.
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(positions, classifications, db=db)
    targets = {t.path: float(t.pct) for t in db.query(Target).all()}
    result = apply_drift(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
        drift_urgent_pct=settings.drift_urgent_pct,
    )
    return result.model_copy(
        update={
            "drift_thresholds": DriftThresholds(
                tolerance_pct=int(settings.drift_tolerance_pct),
                act_pct=int(settings.drift_act_pct),
                urgent_pct=int(settings.drift_urgent_pct),
            ),
        },
        deep=False,
    )


@app.get("/api/snapshots/earliest", dependencies=[Depends(require_admin_token)])
def get_earliest_snapshot(db: Session = Depends(get_db)) -> SnapshotEarliest | None:
    """Return the oldest Snapshot row, or null if none exist."""
    import json as _json

    snap = db.query(Snapshot).order_by(Snapshot.taken_at.asc()).first()
    if snap is None:
        return None
    total: float | None = None
    try:
        payload = _json.loads(snap.payload_json)
        raw = payload.get("total_usd")
        if raw is not None:
            total = float(raw)
    except Exception:
        pass
    return SnapshotEarliest(
        taken_at=snap.taken_at,
        net_worth_usd=snap.net_worth_usd,
        total_usd=total,
    )


@app.get("/api/targets", dependencies=[Depends(require_admin_token)])
def get_targets(db: Session = Depends(get_db)) -> dict[str, object]:
    return _targets_get_payload(db)


@app.put("/api/targets", dependencies=[Depends(require_admin_token)])
def put_targets(body: TargetsPayload, db: Session = Depends(get_db)) -> dict[str, object]:
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(positions, classifications, db=db)
    _validate_put_targets(body, result)

    db.execute(delete(Target))
    for r in body.root:
        db.add(Target(path=r.path, pct=r.pct))
    for rows in body.groups.values():
        for r in rows:
            db.add(Target(path=r.path, pct=r.pct))
    db.commit()
    return _targets_get_payload(db)


@app.get("/api/rebalance", dependencies=[Depends(require_admin_token)])
def get_rebalance(
    mode: Literal["full", "new_money"] = "full",
    amount: float | None = None,
    db: Session = Depends(get_db),
) -> RebalanceResult:
    positions = db.query(Position).all()
    classifications = {**load_classifications(), **load_user_classifications(db)}
    result = aggregate(positions, classifications, db=db)
    targets = {t.path: float(t.pct) for t in db.query(Target).all()}
    result = apply_drift(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
        drift_urgent_pct=settings.drift_urgent_pct,
    )

    if not any("." not in p for p in targets):
        return RebalanceResult(
            mode=mode,
            total=result.total,
            contribution_usd=amount if mode == "new_money" else None,
            moves=[],
        )

    # Stale-L2 detection: mirrors _validate_put_targets group coverage.
    by_name = {s.name: s for s in result.by_asset_class}
    for ac, sl in by_name.items():
        prefix = f"{ac}."
        provided_p = {p for p in targets if p.startswith(prefix)}
        if not provided_p:
            continue
        if ac == "equity":
            required_p = {f"equity.{c.name}" for c in sl.children if c.value > 0}
        else:
            required_p = set()
            for reg in sl.children:
                for leaf in reg.children:
                    if leaf.value > 0:
                        required_p.add(f"{ac}.{leaf.name}")
        if provided_p != required_p:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "stale_targets",
                    "asset_class": ac,
                    "missing_paths": sorted(required_p - provided_p),
                    "extra_paths": sorted(provided_p - required_p),
                },
            )

    if mode == "new_money":
        if amount is None or not math.isfinite(amount) or amount <= 0:
            raise HTTPException(
                status_code=422,
                detail="amount must be a positive finite number for mode=new_money",
            )
        return compute_new_money(
            result,
            targets,
            amount,
            drift_tolerance_pct=settings.drift_tolerance_pct,
        )

    return compute_rebalance(
        result,
        targets,
        drift_tolerance_pct=settings.drift_tolerance_pct,
        drift_act_pct=settings.drift_act_pct,
    )


# ----- classifications (v0.1.5 M3) ----------------------------------------


@app.get("/api/classifications/taxonomy", dependencies=[Depends(require_admin_token)])
def get_taxonomy() -> Taxonomy:
    """Allowed asset_class values with display labels.

    Single source of truth for both /classifications and /manual forms
    (v0.1.5 M4). Frontend renders ``label``, sends ``value``.
    """
    return Taxonomy(asset_classes=ASSET_CLASS_OPTIONS)


@app.post("/api/classifications/suggest", dependencies=[Depends(require_admin_token)])
def suggest_classifications(
    body: ClassificationSuggestRequest, db: Session = Depends(get_db)
) -> list[ClassificationSuggestItem]:
    """LLM hints for tickers not in merged YAML + user classifications.

    Sends each unknown ticker to the configured LLM (ticker symbol only).
    """
    yaml_entries = load_classifications()
    user_entries = load_user_classifications(db)
    merged: dict[str, ClassificationEntry] = {**yaml_entries, **user_entries}
    seen: set[str] = set()
    out: list[ClassificationSuggestItem] = []
    for raw in body.tickers:
        ticker = raw.strip()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        if ticker in merged:
            ent = merged[ticker]
            out.append(
                ClassificationSuggestItem(
                    ticker=ticker,
                    source="existing",
                    asset_class=ent.asset_class,
                    sub_class=ent.sub_class,
                    sector=ent.sector,
                    region=ent.region,
                )
            )
            continue
        res = classify_ticker(ticker)
        if res is None:
            out.append(ClassificationSuggestItem(ticker=ticker, source="none"))
        else:
            out.append(
                ClassificationSuggestItem(
                    ticker=ticker,
                    source="llm",
                    asset_class=res.asset_class,
                    confidence=res.confidence,
                    reasoning=res.reasoning,
                )
            )
    return out


def _full_breakdown(br: Breakdown) -> FundBreakdown:
    """Structure a Breakdown as weight-sorted bucket lists for the UI.

    Each dimension is sorted by weight descending so the hover tooltip
    reads top-weighted first without the frontend needing to re-sort.
    Empty dimensions stay empty lists (bond funds skip sector, gold
    funds skip region, etc.).
    """

    def _sorted(dim: dict[str, float]) -> list[BreakdownBucket]:
        return [
            BreakdownBucket(bucket=b, weight=w)
            for b, w in sorted(dim.items(), key=lambda kv: kv[1], reverse=True)
        ]

    return FundBreakdown(
        region=_sorted(br.region),
        sub_class=_sorted(br.sub_class),
        sector=_sorted(br.sector),
    )


@app.get("/api/classifications", dependencies=[Depends(require_admin_token)])
def list_classifications(db: Session = Depends(get_db)) -> list[ClassificationRow]:
    """YAML baseline + user DB rows, user wins on ticker collision.

    Funds with a known look-through are annotated with ``has_breakdown``
    + the full ``breakdown`` so the UI can show "Auto-split by
    underlying holdings" with a hover tooltip revealing the same
    decomposition the allocation engine uses. YAML lookthroughs are
    consulted directly -- no yfinance calls from this endpoint, which
    keeps the response fast even for thousands of bundled tickers.
    """
    yaml_entries = load_classifications()
    user_rows = {c.ticker: c for c in db.query(Classification).all()}
    breakdowns = get_yaml_breakdowns()

    def _annotate(ticker: str) -> tuple[bool, FundBreakdown | None]:
        br = breakdowns.get(ticker)
        if br is None:
            return (False, None)
        return (True, _full_breakdown(br))

    merged: list[ClassificationRow] = []
    for ticker, entry in yaml_entries.items():
        if ticker in user_rows:
            continue  # user row emitted below with overrides_yaml=True
        has_breakdown, breakdown = _annotate(ticker)
        merged.append(
            ClassificationRow(
                ticker=ticker,
                asset_class=entry.asset_class,
                sub_class=entry.sub_class,
                sector=entry.sector,
                region=entry.region,
                source="yaml",
                has_breakdown=has_breakdown,
                breakdown=breakdown,
            )
        )
    for ticker, row in user_rows.items():
        has_breakdown, breakdown = _annotate(ticker)
        merged.append(
            ClassificationRow(
                ticker=ticker,
                asset_class=row.asset_class,
                sub_class=row.sub_class,
                sector=row.sector,
                region=row.region,
                source="user",
                overrides_yaml=ticker in yaml_entries,
                has_breakdown=has_breakdown,
                breakdown=breakdown,
            )
        )
    merged.sort(key=lambda r: r.ticker)
    return merged


@app.patch("/api/classifications/{ticker}", dependencies=[Depends(require_admin_token)])
def patch_classification(
    ticker: str, body: ClassificationPatch, db: Session = Depends(get_db)
) -> ClassificationRow:
    """Upsert a user-owned classification for ``ticker``.

    Writes a Provenance row per changed field (entity_type='classification',
    entity_key=ticker) so the audit trail matches positions. No diff
    detection across fields: the caller supplies the full target shape,
    and we capture provenance for every field we end up persisting --
    keeps the code small and the audit trail thorough.
    """
    if body.asset_class not in _VALID_ASSET_CLASSES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"asset_class must be one of "
                f"{sorted(_VALID_ASSET_CLASSES)}; got {body.asset_class!r}"
            ),
        )

    now = datetime.now(UTC)
    existing = db.get(Classification, ticker)
    if existing is None:
        existing = Classification(
            ticker=ticker,
            asset_class=body.asset_class,
            sub_class=body.sub_class,
            sector=body.sector,
            region=body.region,
            source="user",
        )
        db.add(existing)
    else:
        existing.asset_class = body.asset_class
        existing.sub_class = body.sub_class
        existing.sector = body.sector
        existing.region = body.region
        existing.source = "user"

    for field, value in (
        ("asset_class", body.asset_class),
        ("sub_class", body.sub_class),
        ("sector", body.sector),
        ("region", body.region),
    ):
        db.add(
            Provenance(
                entity_type="classification",
                entity_id=0,
                entity_key=ticker,
                field=field,
                source="user",
                confidence=1.0,
                llm_span=None,
                captured_at=now,
            )
        )

    db.commit()
    db.refresh(existing)

    yaml_entries = load_classifications()
    return ClassificationRow(
        ticker=ticker,
        asset_class=existing.asset_class,
        sub_class=existing.sub_class,
        sector=existing.sector,
        region=existing.region,
        source="user",
        overrides_yaml=ticker in yaml_entries,
    )


@app.delete(
    "/api/classifications/{ticker}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin_token)],
)
def delete_classification(ticker: str, db: Session = Depends(get_db)) -> None:
    """Revert a user override back to the YAML baseline.

    If the ticker isn't in YAML and any Position still references it,
    block with 409 -- deleting would silently orphan positions into the
    ``unclassified_tickers`` bucket. The user must first reclassify or
    delete those positions.
    """
    existing = db.get(Classification, ticker)
    if existing is None:
        # Nothing to revert. Idempotent no-op so the UI's "Revert"
        # button is safe to click twice.
        return

    yaml_entries = load_classifications()
    has_yaml_fallback = ticker in yaml_entries

    if not has_yaml_fallback:
        position_count = (
            db.query(Position).filter(Position.ticker == ticker).count()
        )
        if position_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{position_count} position(s) reference {ticker!r}; "
                    "delete or reclassify them first."
                ),
            )

    db.delete(existing)
    db.commit()


# ----- export (M5) --------------------------------------------------------


@app.get("/api/export", dependencies=[Depends(require_admin_token)])
def export_all(db: Session = Depends(get_db)) -> ExportResult:
    """Full JSON dump of user-owned state (architecture Privacy + risk #9 manual path).

    Excludes fund_holdings (rebuildable from yfinance/YAML) and the YAML
    classifications (source-controlled). Snapshots are included even
    though the writer lands in v0.5; dumping them empty keeps v0.1
    exports forward-compatible.
    """
    return ExportResult(
        exported_at=datetime.now(UTC),
        accounts=[
            AccountRead.model_validate(a)
            for a in db.query(Account).order_by(Account.id).all()
        ],
        positions=[
            PositionRead.model_validate(p)
            for p in db.query(Position).order_by(Position.id).all()
        ],
        provenance=[
            ProvenanceRead.model_validate(p)
            for p in db.query(Provenance).order_by(Provenance.id).all()
        ],
        snapshots=[
            SnapshotRead.model_validate(s)
            for s in db.query(Snapshot).order_by(Snapshot.id).all()
        ],
    )
