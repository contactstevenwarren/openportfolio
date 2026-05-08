"""Institution list/create."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Institution
from .schemas import InstitutionCreate, InstitutionRead


def list_institutions(db: Session) -> list[InstitutionRead]:
    rows = db.query(Institution).order_by(func.lower(Institution.name)).all()
    return [InstitutionRead.model_validate(r) for r in rows]


def create_institution(db: Session, body: InstitutionCreate) -> InstitutionRead:
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
        existing = (
            db.query(Institution)
            .filter(func.lower(Institution.name) == name.lower())
            .first()
        )
        if existing:
            return InstitutionRead.model_validate(existing)
        raise
