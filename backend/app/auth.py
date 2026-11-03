"""Who is making a request.

The app has no login of its own. On the VM, nginx basic auth signs the user in
and forwards their name in AUTH_USER_HEADER, overwriting any value a client
sent. The header is believed only when the request comes from a trusted proxy
(nginx on the same machine); the backend listens on 127.0.0.1 only.
"""

from fastapi import Request

from app.config import Settings


def user_from_request(request: Request, settings: Settings) -> str | None:
    """The signed-in user's name, or None when the request isn't signed in."""
    host = request.client.host if request.client else None
    if host in settings.trusted_proxies:
        user = request.headers.get(settings.AUTH_USER_HEADER, "").strip()
        if user:
            return user
    return settings.AUTH_DEV_USER or None
