from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import AllocationResult, PositionContributionsResponse

from . import service as allocation_svc

router = APIRouter(
    prefix="/api/allocation",
    tags=["allocation"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="Portfolio allocation with drift bands")
def get_allocation(db: Session = Depends(get_db)) -> AllocationResult:
    return allocation_svc.get_allocation(db)


@router.get(
    "/positions/{asset_class}",
    summary="Per-position contributions to an asset-class slice",
)
def get_allocation_positions(
    asset_class: str,
    l2: str | None = Query(None),
    db: Session = Depends(get_db),
) -> PositionContributionsResponse:
    return allocation_svc.get_allocation_positions(db, asset_class, l2)
