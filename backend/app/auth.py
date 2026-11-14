"""Who is making a request.

The app has one owner account (scripts/create_owner.py) and signs in through
POST /api/auth/login, which sets an HttpOnly, SameSite=Strict session cookie.
Every /api/ route except sign-in itself requires that cookie
(`require_session`, attached in app/main.py).

Requests that change data must also send `X-Requested-With: FinApp`
(`require_csrf_header`). A form or link on another site can't add a custom
header, so even if a browser sent the cookie cross-site, the request is
refused.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.owner import Owner
from app.services.auth_service import AuthService

SESSION_COOKIE = "finapp_session"
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "FinApp"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_csrf_header(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(status_code=403, detail="Request blocked.")


def require_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Owner:
    """The signed-in owner; 401 if the cookie is missing, unknown or expired."""
    owner = AuthService.authenticate(db, settings, request.cookies.get(SESSION_COOKIE))
    if owner is None:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return owner
