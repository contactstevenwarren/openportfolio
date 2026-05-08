"""Institution API types."""

from pydantic import BaseModel, ConfigDict


class InstitutionRead(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class InstitutionCreate(BaseModel):
    name: str
