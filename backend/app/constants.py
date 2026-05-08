"""Shared portfolio constants derived from API schema enums."""

from app.schemas import ASSET_CLASS_OPTIONS

VALID_ASSET_CLASSES = frozenset(o.value for o in ASSET_CLASS_OPTIONS)
