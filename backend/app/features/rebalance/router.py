from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import RebalanceResult

from . import service as rebalance_svc

router = APIRouter(
    prefix="/api/rebalance",
    tags=["rebalance"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="Rebalance trade suggestions")
def get_rebalance(
    mode: Literal["full", "new_money"] = Query("full"),
    amount: float | None = Query(None),
    db: Session = Depends(get_db),
) -> RebalanceResult:
    return rebalance_svc.get_rebalance(db, mode, amount)
