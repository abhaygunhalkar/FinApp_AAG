"""Who is making a request.

The app has no login of its own. On the VM, nginx basic auth signs the user in
and forwards their name in AUTH_USER_HEADER, overwriting any value a client
sent. The header is believed only when the request provably came through
nginx:

- With AUTH_PROXY_SECRET set (the VM), nginx also sends that secret in
  AUTH_PROXY_SECRET_HEADER, and it must match. This is the check to rely on:
  uvicorn replaces the client address with the browser's (from nginx's
  X-Forwarded-For), so the address can't tell nginx from anyone else.
- Without a secret, the request's client address must be in
  AUTH_TRUSTED_PROXIES. That only holds when nothing rewrites the address.
"""

import hmac

from fastapi import Request

from app.config import Settings


def _via_trusted_proxy(request: Request, settings: Settings) -> bool:
    secret = settings.AUTH_PROXY_SECRET
    if secret:
        sent = request.headers.get(settings.AUTH_PROXY_SECRET_HEADER, "")
        return hmac.compare_digest(sent.encode(), secret.encode())
    host = request.client.host if request.client else None
    return host in settings.trusted_proxies


def user_from_request(request: Request, settings: Settings) -> str | None:
    """The signed-in user's name, or None when the request isn't signed in."""
    if _via_trusted_proxy(request, settings):
        user = request.headers.get(settings.AUTH_USER_HEADER, "").strip()
        if user:
            return user
    return settings.AUTH_DEV_USER or None
