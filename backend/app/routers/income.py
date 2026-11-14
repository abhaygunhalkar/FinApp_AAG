"""Income sources and cash flow summary API router."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.account_forecast import AccountForecastResponse
from app.schemas.common import ApiResponse
from app.schemas.income import (
    CashFlowSummary,
    IncomeSourceCreate,
    IncomeSourceResponse,
    IncomeSourceUpdate,
)
from app.services.account_forecast_service import AccountForecastService
from app.services.income_service import IncomeNotFoundError, IncomeService

router = APIRouter(prefix="/api", tags=["income"])


@router.get("/income", response_model=ApiResponse[list[IncomeSourceResponse]])
def get_income_sources(db: Session = Depends(get_db)) -> dict[str, object]:
    """Retrieve all income sources."""
    return {"success": True, "data": IncomeService.get_all(db), "error": None}


@router.post(
    "/income",
    response_model=ApiResponse[IncomeSourceResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_income_source(
    data: IncomeSourceCreate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Add an income source."""
    try:
        source = IncomeService.create(db, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": source, "error": None}


@router.put("/income/{income_id}", response_model=ApiResponse[IncomeSourceResponse])
def update_income_source(
    income_id: int, data: IncomeSourceUpdate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Edit an income source."""
    try:
        source = IncomeService.update(db, income_id, data)
    except IncomeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": source, "error": None}


@router.delete("/income/{income_id}", response_model=ApiResponse[None])
def delete_income_source(
    income_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Delete an income source."""
    try:
        IncomeService.delete(db, income_id)
    except IncomeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"success": True, "data": None, "error": None}


@router.get("/cash-flow/summary", response_model=ApiResponse[CashFlowSummary])
def get_cash_flow_summary(db: Session = Depends(get_db)) -> dict[str, object]:
    """Monthly income vs fixed costs, and emergency-fund coverage."""
    summary = IncomeService.get_cash_flow_summary(db)
    return {"success": True, "data": summary, "error": None}


@router.get("/cash-flow/forecast", response_model=ApiResponse[AccountForecastResponse])
def get_account_forecast(
    days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db)
) -> dict[str, object]:
    """Per-account balance through the bills and paydays of the next `days` days."""
    forecast = AccountForecastService.get_forecast(db, days)
    return {"success": True, "data": forecast, "error": None}
