import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import delete, inspect, text
from sqlalchemy.orm import Session

from . import models  # noqa: F401  -- register models with Base before create_all
from .allocation import aggregate
from .auth import require_admin_token
from .config import settings
from .drift import apply_drift
from .classifications import (
    load_classifications,
    load_user_classifications,
    migrate_synthetic_positions,
)
from .db import Base, SessionLocal, engine, get_db
from .llm import extract_positions
from .lookthrough import Breakdown, get_yaml_breakdowns
from .models import Account, Classification, Position, Provenance, Snapshot, Target
from .schemas import (
    ASSET_CLASS_OPTIONS,
    AccountCreate,
    AccountPatch,
    AccountRead,
    AllocationResult,
    BreakdownBucket,
    ClassificationPatch,
    ClassificationRow,
    CommitResult,
    ExportResult,
    ExtractionResult,
    ExtractRequest,
    FundBreakdown,
    PositionCommit,
    PositionPatch,
    PositionRead,
    ProvenanceRead,
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


def _targets_sum_ok(pcts: list[float], tol: float = 0.1) -> bool:
    return abs(sum(pcts) - 100.0) <= tol + 1e-9


def _validate_put_targets(body: TargetsPayload, result: AllocationResult) -> None:
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
                detail="root targets must sum to 100 (+/- 0.1)",
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
                detail=f"group {gkey!r} targets must sum to 100 (+/- 0.1)",
            )


def _targets_get_payload(db: Session) -> dict[str, object]:
    rows = db.query(Target).order_by(Target.path).all()
    root: list[dict[str, object]] = []
    groups: dict[str, list[dict[str, object]]] = {}
    for r in rows:
        if "." not in r.path:
            root.append({"path": r.path, "pct": r.pct})
        else:
            key, _rest = r.path.split(".", 1)
            groups.setdefault(key, []).append({"path": r.path, "pct": r.pct})
    for _k, lst in groups.items():
        lst.sort(key=lambda x: str(x["path"]))
    return {"root": root, "groups": groups}


def _migrate_sqlite_schema() -> None:
    """Additive column migrations for the v0.1 → v0.1.5 transition.

    ``create_all`` only creates missing tables; it does not add columns
    to existing ones. For a maintainer whose SQLite file predates
    v0.1.5 we add the new ``provenance.entity_key`` column in place.
    Idempotent -- the inspector check means repeated startups are a
    no-op. Drops out of the way once the codebase moves to a real
    migration tool.
    """
    inspector = inspect(engine)
    if "provenance" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("provenance")}
    if "entity_key" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE provenance ADD COLUMN entity_key VARCHAR(64)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_provenance_entity_key ON provenance(entity_key)")
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


@app.post("/api/extract", dependencies=[Depends(require_admin_token)])
def extract(body: ExtractRequest) -> ExtractionResult:
    return extract_positions(body.text)


# ----- accounts -----------------------------------------------------------


@app.get("/api/accounts", dependencies=[Depends(require_admin_token)])
def list_accounts(db: Session = Depends(get_db)) -> list[AccountRead]:
    return [AccountRead.model_validate(a) for a in db.query(Account).order_by(Account.id).all()]


@app.post(
    "/api/accounts",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_token)],
)
def create_account(body: AccountCreate, db: Session = Depends(get_db)) -> AccountRead:
    account = Account(label=body.label, type=body.type)
    db.add(account)
    db.commit()
    db.refresh(account)
    return AccountRead.model_validate(account)


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
    db.commit()
    db.refresh(account)
    return AccountRead.model_validate(account)


@app.delete(
    "/api/accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin_token)],
)
def delete_account(account_id: int, db: Session = Depends(get_db)) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Positions cascade via the Account.positions relationship
    # (cascade="all, delete-orphan") + schema-level ondelete=CASCADE on
    # Position.account_id. Provenance rows stay as an audit trail,
    # matching the delete_position behavior (v0.1 decision).
    db.delete(account)
    db.commit()


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


@app.post(
    "/api/positions/commit",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_token)],
)
def commit_positions(
    body: PositionCommit, db: Session = Depends(get_db)
) -> CommitResult:
    account = _resolve_account(db, body.account_id)
    now = datetime.now(UTC)

    created_ids: list[int] = []
    final_tickers: list[str] = []
    for row in body.positions:
        # Manual entries carry a classification payload + get ticker
        # auto-suffixing on collision so "Gold bar" entered twice
        # becomes gold-bar and gold-bar-2. Paste entries share tickers
        # intentionally (two brokerages both holding VTI).
        ticker = row.ticker
        if row.classification is not None:
            if row.classification.asset_class not in _VALID_ASSET_CLASSES:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"asset_class must be one of "
                        f"{sorted(_VALID_ASSET_CLASSES)}; "
                        f"got {row.classification.asset_class!r}"
                    ),
                )
            ticker = _resolve_ticker(db, ticker)
            db.add(
                Classification(
                    ticker=ticker,
                    asset_class=row.classification.asset_class,
                    sub_class=row.classification.sub_class,
                    sector=row.classification.sector,
                    region=row.classification.region,
                    source="user",
                )
            )
            for field, value in (
                ("asset_class", row.classification.asset_class),
                ("sub_class", row.classification.sub_class),
                ("sector", row.classification.sector),
                ("region", row.classification.region),
            ):
                db.add(
                    Provenance(
                        entity_type="classification",
                        entity_id=0,
                        entity_key=ticker,
                        field=field,
                        source=body.source,
                        confidence=1.0,
                        llm_span=None,
                        captured_at=now,
                    )
                )

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

        # Provenance rows for every numeric field we persisted. ticker is
        # a label, not a number, so it doesn't get a provenance row
        # (roadmap Principles: every *number* carries provenance).
        for field, value in (
            ("shares", row.shares),
            ("cost_basis", row.cost_basis),
            ("market_value", row.market_value),
        ):
            if value is None:
                continue
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
            net_worth_usd=result.total,
            payload_json=json.dumps(payload, sort_keys=True),
        )
    )
    db.commit()


# ----- positions read / patch / delete (M3) ------------------------------


@app.get("/api/positions", dependencies=[Depends(require_admin_token)])
def list_positions(db: Session = Depends(get_db)) -> list[PositionRead]:
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
    targets = {t.path: t.pct for t in db.query(Target).all()}
    return apply_drift(
        result,
        targets,
        drift_minor_pct=settings.drift_minor_pct,
        drift_major_pct=settings.drift_major_pct,
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


# ----- classifications (v0.1.5 M3) ----------------------------------------


@app.get("/api/classifications/taxonomy", dependencies=[Depends(require_admin_token)])
def get_taxonomy() -> Taxonomy:
    """Allowed asset_class values with display labels.

    Single source of truth for both /classifications and /manual forms
    (v0.1.5 M4). Frontend renders ``label``, sends ``value``.
    """
    return Taxonomy(asset_classes=ASSET_CLASS_OPTIONS)


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
