from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import SnapshotEarliest

from . import service as snapshots_svc

router = APIRouter(
    prefix="/api/snapshots",
    tags=["snapshots"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("/earliest", summary="Earliest net-worth snapshot")
def get_earliest_snapshot(
    db: Session = Depends(get_db),
) -> SnapshotEarliest | None:
    return snapshots_svc.get_earliest_snapshot(db)
