"""Pydantic schemas for signing in."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=256)


class AuthUserResponse(BaseModel):
    username: str
