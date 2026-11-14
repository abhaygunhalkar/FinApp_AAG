"""Pydantic schemas for the Plaid endpoints (mirrors frontend/src/api/plaid.ts)."""

from datetime import datetime

from pydantic import BaseModel


class ExchangeTokenRequest(BaseModel):
    public_token: str


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenResponse(BaseModel):
    item_id: str
    institution_name: str
    accounts_synced: int


class PlaidItemInfo(BaseModel):
    """A connected institution and how many Net Worth accounts it feeds."""

    id: int
    item_id: str
    institution_name: str | None
    last_synced: datetime | None
    account_count: int


class PlaidSyncResponse(BaseModel):
    items_synced: int
    accounts_updated: int
