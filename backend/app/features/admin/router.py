from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import ExportResult

from . import service as admin_svc

export_router = APIRouter(
    prefix="/api",
    tags=["export"],
    dependencies=[Depends(require_admin_token)],
)

admin_router = APIRouter(
    prefix="/api",
    tags=["admin"],
    dependencies=[Depends(require_admin_token)],
)


@export_router.get("/export", summary="Full JSON export of user-owned state")
def export_all(db: Session = Depends(get_db)) -> ExportResult:
    return admin_svc.export_all(db)


@admin_router.post(
    "/reset",
    summary="Wipe all user data (irreversible)",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reset_all(db: Session = Depends(get_db)) -> None:
    admin_svc.reset_all(db)
