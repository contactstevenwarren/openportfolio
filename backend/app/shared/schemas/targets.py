"""Target allocation PUT/GET shapes."""

from pydantic import BaseModel, Field


class TargetRow(BaseModel):
    path: str
    pct: int = Field(ge=0, le=100)


class TargetsPayload(BaseModel):
    root: list[TargetRow]
    groups: dict[str, list[TargetRow]] = Field(default_factory=dict)
