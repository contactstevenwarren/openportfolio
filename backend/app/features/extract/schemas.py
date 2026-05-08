"""Extract API request/response models.

Re-exported from ``app.schemas`` until types move here without import cycles.
"""

from app.schemas import ExtractRequest, ExtractionResult

__all__ = ["ExtractRequest", "ExtractionResult"]
