"""Dashboard API router."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.dashboard import (
    ActivityEvent,
    BrokerSummary,
    DashboardSummary,
    PortfolioSnapshot,
)
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=ApiResponse[DashboardSummary])
def get_dashboard_summary(
    db: Session = Depends(get_db),
) -> ApiResponse[DashboardSummary]:
    """Return aggregate portfolio metrics including stale_data and last_successful_fetch."""
    summary = DashboardService.get_summary(db)
    return ApiResponse(success=True, data=summary, error=None)


@router.get("/by-broker", response_model=ApiResponse[list[BrokerSummary]])
def get_dashboard_by_broker(
    db: Session = Depends(get_db),
) -> ApiResponse[list[BrokerSummary]]:
    """Return market value aggregated by brokerage account."""
    summary = DashboardService.get_broker_summary(db)
    return ApiResponse(success=True, data=summary, error=None)


@router.get("/activity", response_model=ApiResponse[list[ActivityEvent]])
def get_dashboard_activity(
    db: Session = Depends(get_db),
) -> ApiResponse[list[ActivityEvent]]:
    """Return the most recent portfolio activity events."""
    activity = DashboardService.get_activity_feed(db)
    return ApiResponse(success=True, data=activity, error=None)


@router.get("/history", response_model=ApiResponse[list[PortfolioSnapshot]])
def get_dashboard_history(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> ApiResponse[list[PortfolioSnapshot]]:
    """Return portfolio value history for the specified number of days."""
    history = DashboardService.get_portfolio_history(db, days=days)
    return ApiResponse(success=True, data=history, error=None)
