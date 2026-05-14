"""Pydantic API DTOs (HTTP JSON contracts).

Implementation is split under ``app.shared.schemas.*``; this module re-exports
everything for stable imports (``from app.schemas import …``) and OpenAPI.

Extracted rows carry confidence + source span per architecture.md; derived
metrics stay in Python domain modules, not LLM output.
"""

from app.shared.schemas.accounts import (
    TAX_TREATMENTS_BROKERAGE_ONLY,
    VALID_TAX_TREATMENTS,
    MANUAL_ACCOUNT_TYPES,
    InitialAssetPosition,
    AccountCreate,
    AccountPatch,
    AccountClassBreakdown,
    AccountRead,
)
from app.shared.schemas.allocation import (
    DriftBand,
    AllocationSlice,
    DriftThresholds,
    AllocationResult,
    PositionContribution,
    PositionContributionsResponse,
)
from app.shared.schemas.classifications import (
    ClassificationBucketPayload,
    ClassificationRow,
    ClassificationPatch,
    ClassificationSuggestRequest,
    ClassificationSuggestItem,
    TaxonomyOption,
    Taxonomy,
    ASSET_CLASS_OPTIONS,
)
from app.shared.schemas.export import (
    ProvenanceRead,
    SnapshotRead,
    SnapshotEarliest,
    SnapshotListItem,
    LiabilityRead,
    LiabilityCreate,
    LiabilityPatch,
    ExportResult,
)
from app.shared.schemas.extract import (
    ExtractedPosition,
    ExtractionResult,
    ExtractRequest,
)
from app.shared.schemas.institutions import InstitutionCreate, InstitutionRead
from app.shared.schemas.positions import (
    InlineClassification,
    CommitPosition,
    PositionCommit,
    CommitResult,
    PositionRead,
    PositionPatch,
)
from app.shared.schemas.rebalance import (
    RebalanceDirection,
    RebalanceMode,
    RebalanceMove,
    RebalanceResult,
)
from app.shared.schemas.targets import TargetRow, TargetsPayload

__all__ = [
    "TAX_TREATMENTS_BROKERAGE_ONLY",
    "VALID_TAX_TREATMENTS",
    "MANUAL_ACCOUNT_TYPES",
    "InitialAssetPosition",
    "AccountCreate",
    "AccountPatch",
    "AccountClassBreakdown",
    "AccountRead",
    "InstitutionRead",
    "InstitutionCreate",
    "InlineClassification",
    "CommitPosition",
    "PositionCommit",
    "CommitResult",
    "PositionRead",
    "PositionPatch",
    "ProvenanceRead",
    "SnapshotRead",
    "SnapshotEarliest",
    "SnapshotListItem",
    "LiabilityRead",
    "LiabilityCreate",
    "LiabilityPatch",
    "ExportResult",
    "ExtractedPosition",
    "ExtractionResult",
    "ExtractRequest",
    "DriftBand",
    "AllocationSlice",
    "ClassificationBucketPayload",
    "ClassificationRow",
    "ClassificationPatch",
    "ClassificationSuggestRequest",
    "ClassificationSuggestItem",
    "TaxonomyOption",
    "Taxonomy",
    "ASSET_CLASS_OPTIONS",
    "DriftThresholds",
    "AllocationResult",
    "PositionContribution",
    "PositionContributionsResponse",
    "TargetRow",
    "TargetsPayload",
    "RebalanceDirection",
    "RebalanceMode",
    "RebalanceMove",
    "RebalanceResult",
]
