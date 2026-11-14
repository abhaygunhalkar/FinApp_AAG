"""Password hashing with scrypt (Python's standard library) and password rules."""

import base64
import hashlib
import hmac
import re
import secrets

# scrypt cost: about 32 MB of memory and tens of milliseconds per check.
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
_MAXMEM = 64 * 1024 * 1024

MIN_LENGTH = 12
MAX_LENGTH = 128
USERNAME = re.compile(r"^[A-Za-z0-9._@-]{3,50}$")


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=32
    )


def hash_password(password: str) -> str:
    """'scrypt$n$r$p$salt$hash', with a new random salt each time."""
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """True if the password matches; False for a wrong or unreadable hash."""
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
        return hmac.compare_digest(actual, base64.b64decode(digest))
    except ValueError:
        return False


# Checked against when the username is wrong, so both cases take as long.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def username_problem(username: str) -> str | None:
    if not USERNAME.match(username):
        return (
            "Username must be 3 to 50 characters: letters, numbers, "
            "dots, dashes, underscores or @."
        )
    return None


def password_problem(password: str, username: str) -> str | None:
    """Why a new password isn't allowed, or None if it is."""
    if len(password) < MIN_LENGTH:
        return f"Password must be at least {MIN_LENGTH} characters."
    if len(password) > MAX_LENGTH:
        return f"Password must be at most {MAX_LENGTH} characters."
    if password.strip() != password:
        return "Password can't start or end with a space."
    if username.lower() in password.lower():
        return "Password can't contain the username."
    if len(set(password)) < 5:
        return "Password needs more variety (at least 5 different characters)."
    return None
