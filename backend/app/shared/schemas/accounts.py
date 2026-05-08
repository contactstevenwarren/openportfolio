"""Account API types and validation constants."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# Tax treatments that are only valid with type="brokerage"
TAX_TREATMENTS_BROKERAGE_ONLY = {"tax_deferred", "tax_free", "hsa"}
VALID_TAX_TREATMENTS = {"taxable", "tax_deferred", "tax_free", "hsa"}

# Account types that map to is_manual=True
MANUAL_ACCOUNT_TYPES = {"real_estate", "private"}


class InitialAssetPosition(BaseModel):
    """Initial position for a new real_estate or private account."""

    market_value: float = Field(ge=0)
    cost_basis: float | None = None
    purchase_date: date | None = None


class AccountCreate(BaseModel):
    label: str
    type: str = "brokerage"
    institution_id: int | None = None
    tax_treatment: str = "taxable"
    staleness_threshold_days: int = 30
    is_archived: bool = False
    initial_position: InitialAssetPosition | None = None


class AccountPatch(BaseModel):
    label: str | None = None
    type: str | None = None
    institution_id: int | None = None
    tax_treatment: str | None = None
    staleness_threshold_days: int | None = None
    is_archived: bool | None = None
    is_investable: bool | None = None


class AccountClassBreakdown(BaseModel):
    asset_class: str
    value: float


class AccountRead(BaseModel):
    id: int
    label: str
    type: str
    currency: str
    institution_id: int | None = None
    institution_name: str | None = None
    tax_treatment: str = "taxable"
    balance: float = 0.0
    last_updated_at: str | None = None
    last_update_source: str | None = None
    position_count: int = 0
    classified_position_count: int = 0
    class_breakdown: list[AccountClassBreakdown] = Field(default_factory=list)
    is_manual: bool = False
    is_archived: bool = False
    staleness_threshold_days: int = 30
    is_investable: bool = True

    model_config = ConfigDict(from_attributes=True)
