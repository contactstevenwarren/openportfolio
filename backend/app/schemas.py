"""Backward-compatible re-exports for API DTOs.

Prefer importing from ``app.shared.schemas`` (or a feature's ``schemas.py``)
for new code. OpenAPI and ``from app.schemas import …`` remain valid.
"""

from app.shared.schemas import *  # noqa: F403
from app.shared.schemas import __all__ as __all__
