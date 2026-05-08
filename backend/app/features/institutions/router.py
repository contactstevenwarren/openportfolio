from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from . import service as institutions_svc
from .schemas import InstitutionCreate, InstitutionRead

router = APIRouter(
    prefix="/api/institutions",
    tags=["institutions"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="List all institutions")
def list_institutions(db: Session = Depends(get_db)) -> list[InstitutionRead]:
    return institutions_svc.list_institutions(db)


@router.post("", summary="Create an institution")
def create_institution(
    body: InstitutionCreate, db: Session = Depends(get_db)
) -> InstitutionRead:
    return institutions_svc.create_institution(db, body)
