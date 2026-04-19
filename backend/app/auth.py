"""Single-user admin-token auth for v0.1 (docs/architecture.md auth seam).

v0.2 replaces this with Auth.js magic-link sessions validated via shared
secret. Until then, every protected endpoint takes an X-Admin-Token header
and we compare it against the ADMIN_TOKEN env var in constant time.
"""

import hmac

from fastapi import Header, HTTPException, status

from .config import settings


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    # Refuse if the server wasn't configured with a token, so a missing
    # secret can't accidentally disable auth.
    if not settings.admin_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="server admin token not configured",
        )
    if x_admin_token is None or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing admin token",
        )
