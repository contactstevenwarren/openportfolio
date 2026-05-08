from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import TargetsPayload

from . import service as targets_svc

router = APIRouter(
    prefix="/api/targets",
    tags=["targets"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="Get target allocation")
def get_targets(db: Session = Depends(get_db)) -> dict[str, object]:
    return targets_svc.get_targets(db)


@router.put("", summary="Replace target allocation")
def put_targets(
    body: TargetsPayload, db: Session = Depends(get_db)
) -> dict[str, object]:
    return targets_svc.put_targets(db, body)
