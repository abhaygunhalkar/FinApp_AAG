"""Pydantic schemas for financial accounts and net worth."""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

ASSET_TYPES = {"checking", "savings", "investment", "real_estate", "vehicle", "other_asset"}
LIABILITY_TYPES = {"credit_card", "loan", "mortgage", "other_liability"}
ALL_ACCOUNT_TYPES = ASSET_TYPES | LIABILITY_TYPES


class FinancialAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    institution: str | None = None
    account_type: str
    balance: float = Field(..., ge=0)
    notes: str | None = None

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: str) -> str:
        if v not in ALL_ACCOUNT_TYPES:
            raise ValueError(f"account_type must be one of: {', '.join(sorted(ALL_ACCOUNT_TYPES))}")
        return v


class FinancialAccountUpdate(BaseModel):
    name: str | None = None
    institution: str | None = None
    balance: float | None = Field(None, ge=0)
    notes: str | None = None


class FinancialAccountResponse(BaseModel):
    id: int
    name: str
    institution: str | None
    account_type: str
    balance: float
    is_asset: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NetWorthSummaryResponse(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float


class NetWorthSnapshotResponse(BaseModel):
    id: int
    date: date
    total_assets: float
    total_liabilities: float
    net_worth: float
    created_at: datetime

    model_config = {"from_attributes": True}
