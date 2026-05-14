from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from . import service as snapshots_svc
from .schemas import SnapshotEarliest, SnapshotListItem

router = APIRouter(
    prefix="/api/snapshots",
    tags=["snapshots"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("/", summary="List investable snapshots (chronological)")
def list_snapshots(
    db: Session = Depends(get_db),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[SnapshotListItem]:
    return snapshots_svc.list_snapshots(db, limit=limit)


@router.get("/earliest", summary="Earliest net-worth snapshot")
def get_earliest_snapshot(
    db: Session = Depends(get_db),
) -> SnapshotEarliest | None:
    return snapshots_svc.get_earliest_snapshot(db)
