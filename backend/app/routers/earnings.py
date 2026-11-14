"""Earnings calendar API router."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.earnings import EarningsCalendarEntry
from app.services.earnings_service import EarningsService

router = APIRouter(prefix="/api/earnings", tags=["earnings"])


@router.get("/calendar", response_model=ApiResponse[list[EarningsCalendarEntry]])
def get_earnings_calendar(db: Session = Depends(get_db)) -> dict[str, object]:
    """Large-cap earnings for today through two days ahead."""
    items = EarningsService.get_calendar(db, get_settings().FINNHUB_API_KEY)
    return {"success": True, "data": items, "error": None}
