from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.orm import Session

from . import models  # noqa: F401  -- register models with Base before create_all
from .allocation import aggregate
from .auth import require_admin_token
from .classifications import load_classifications
from .db import Base, engine, get_db
from .llm import extract_positions
from .models import Account, Position, Provenance
from .schemas import (
    AccountCreate,
    AccountRead,
    AllocationResult,
    CommitResult,
    ExtractionResult,
    ExtractRequest,
    PositionCommit,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
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
    for row in body.positions:
        position = Position(
            account_id=account.id,
            ticker=row.ticker,
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
        # (roadmap principle: every *number* carries provenance).
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

    db.commit()
    return CommitResult(account_id=account.id, position_ids=created_ids)


# ----- allocation ---------------------------------------------------------


@app.get("/api/allocation", dependencies=[Depends(require_admin_token)])
def get_allocation(db: Session = Depends(get_db)) -> AllocationResult:
    positions = db.query(Position).all()
    classifications = load_classifications()
    return aggregate(positions, classifications)
