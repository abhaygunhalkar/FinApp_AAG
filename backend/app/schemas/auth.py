"""Pydantic schemas for signing in."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=256)
    # Authenticator or backup code; needed only when two-step sign-in is on.
    code: str | None = Field(None, max_length=32)


class LoginResponse(BaseModel):
    username: str
    # True: the password was right, now send it again with a code.
    code_required: bool


class AuthUserResponse(BaseModel):
    username: str
    two_step_enabled: bool
    backup_codes_left: int
