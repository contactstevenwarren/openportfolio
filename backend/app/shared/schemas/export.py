"""Export snapshot, provenance, liability shapes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.shared.schemas.accounts import AccountRead
from app.shared.schemas.positions import PositionRead


class ProvenanceRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    entity_key: str | None = None
    field: str
    source: str
    confidence: float | None
    llm_span: str | None
    captured_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotRead(BaseModel):
    id: int
    taken_at: datetime
    net_worth_usd: float
    payload_json: str

    model_config = ConfigDict(from_attributes=True)


class SnapshotEarliest(BaseModel):
    taken_at: datetime
    net_worth_usd: float
    total_usd: float | None = None


class LiabilityRead(BaseModel):
    id: int
    label: str
    kind: str
    balance: float
    as_of: datetime
    institution_id: int | None = None
    notes: str | None = None
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LiabilityCreate(BaseModel):
    label: str
    kind: str
    balance: float = Field(ge=0)
    as_of: datetime
    institution_id: int | None = None
    notes: str | None = None


class LiabilityPatch(BaseModel):
    label: str | None = None
    kind: str | None = None
    balance: float | None = Field(default=None, ge=0)
    as_of: datetime | None = None
    institution_id: int | None = None
    notes: str | None = None


class ExportResult(BaseModel):
    exported_at: datetime
    app_version: str = "0.1"
    accounts: list[AccountRead]
    positions: list[PositionRead]
    provenance: list[ProvenanceRead]
    snapshots: list[SnapshotRead]
    liabilities: list[LiabilityRead] = Field(default_factory=list)


ExportResult.model_rebuild()
