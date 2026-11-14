"""Authenticator-app codes (TOTP, RFC 6238) and one-time backup codes.

Standard library only. Codes are 6 digits, change every 30 seconds and use
SHA-1, the settings every authenticator app supports.
"""

import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote

DIGITS = 6
PERIOD = 30
# Codes from one step before or after are accepted, for clocks a little off.
WINDOW = 1
ISSUER = "FinApp"

BACKUP_CODE_COUNT = 10
# No 0/o, 1/l/i, so codes read back without mistakes.
_BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_secret() -> str:
    """A random 160-bit key, base32 without padding (what the apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _key(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def code_at(secret: str, counter: int, digits: int = DIGITS) -> str:
    digest = hmac.new(_key(secret), counter.to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(number % 10**digits).zfill(digits)


def counter_at(timestamp: float) -> int:
    return int(timestamp // PERIOD)


def matching_counter(
    secret: str, code: str, timestamp: float | None = None
) -> int | None:
    """The time step a code belongs to, or None if it isn't current."""
    code = code.strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    now = counter_at(time.time() if timestamp is None else timestamp)
    for counter in range(now - WINDOW, now + WINDOW + 1):
        if hmac.compare_digest(code_at(secret, counter), code):
            return counter
    return None


def setup_key(secret: str) -> str:
    """The secret in groups of four, for typing into an app."""
    return " ".join(secret[i : i + 4] for i in range(0, len(secret), 4))


def otpauth_uri(secret: str, username: str) -> str:
    """The link a QR code would hold; some apps accept it pasted."""
    label = quote(f"{ISSUER}:{username}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"
    )


def new_backup_codes() -> list[str]:
    """Ten codes like 'k7mp-q2xa'. Shown once; only their hashes are kept."""
    return [
        "-".join(
            "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(4))
            for _ in range(2)
        )
        for _ in range(BACKUP_CODE_COUNT)
    ]


def backup_code_hash(code: str) -> str:
    normalised = code.strip().lower().replace("-", "").replace(" ", "")
    return hashlib.sha256(normalised.encode()).hexdigest()
