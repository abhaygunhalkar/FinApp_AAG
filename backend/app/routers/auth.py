"""Sign in and out: /api/auth."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, require_session
from app.config import Settings, get_settings
from app.database import get_db
from app.models.owner import Owner
from app.schemas.auth import AuthUserResponse, LoginRequest, LoginResponse
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService, backup_codes_left
from app.services.rate_limit import InMemoryRateLimiter, RateLimiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

_limiter: RateLimiter | None = None


def get_login_limiter() -> RateLimiter:
    """Sign-in attempts per client address; tests replace it."""
    global _limiter
    if _limiter is None:
        _limiter = InMemoryRateLimiter(get_settings().AUTH_LOGIN_ATTEMPTS_PER_MINUTE)
    return _limiter


def _set_cookie(response: Response, token: str, settings: Settings) -> None:
    # No max-age: the cookie also goes when the browser closes. The server
    # ends the session on its own idle and absolute limits.
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


@router.post("/login", response_model=ApiResponse[LoginResponse])
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[RateLimiter, Depends(get_login_limiter)],
) -> dict[str, object]:
    ip = request.client.host if request.client else None
    if limiter.check(ip or "unknown") is not None:
        raise HTTPException(
            status_code=429, detail="Too many sign-in attempts. Wait a minute."
        )
    result = AuthService.login(
        db,
        settings,
        body.username,
        body.password,
        code=body.code,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
    )
    if result.token is not None:
        _set_cookie(response, result.token, settings)
    data = {"username": result.owner.username, "code_required": result.code_required}
    return {"success": True, "data": data, "error": None}


@router.post("/logout", response_model=ApiResponse[None])
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, object]:
    AuthService.logout(db, request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="strict",
    )
    return {"success": True, "data": None, "error": None}


@router.get("/me", response_model=ApiResponse[AuthUserResponse])
def me(owner: Annotated[Owner, Depends(require_session)]) -> dict[str, object]:
    data = {
        "username": owner.username,
        "two_step_enabled": owner.totp_secret is not None,
        "backup_codes_left": backup_codes_left(owner),
    }
    return {"success": True, "data": data, "error": None}
