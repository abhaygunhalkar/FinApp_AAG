"""Market data API router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.market import (
    CachedQuote,
    CompanyInfo,
    MarketQuote,
    PricePoint,
    RefreshSummary,
)
from app.services.market_data_service import MarketDataService

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/brokers", response_model=ApiResponse[list[str]])
def get_brokers() -> dict[str, object]:
    """Return the list of configured brokers."""
    return {"success": True, "data": get_settings().broker_list, "error": None}


@router.post("/refresh", response_model=ApiResponse[RefreshSummary])
def refresh_prices(db: Session = Depends(get_db)) -> dict[str, object]:
    """Manually refresh prices for all holdings and watchlist items from yfinance."""
    result = MarketDataService.refresh_all_prices(db)
    summary = RefreshSummary(
        updated=result.success_count,
        failed=result.failure_count,
        tickers_updated=result.tickers_updated,
        tickers_failed=result.tickers_failed,
    )
    return {"success": True, "data": summary, "error": None}


@router.get("/quote/{ticker}", response_model=ApiResponse[MarketQuote | CachedQuote])
def get_quote(ticker: str, db: Session = Depends(get_db)) -> dict[str, object]:
    """Current quote from yfinance, else the last saved price; 404 if neither."""
    quote = MarketDataService.fetch_quote(ticker)
    if quote is not None:
        return {"success": True, "data": quote, "error": None}
    cached_price = MarketDataService.get_cached_price(db, ticker)
    if cached_price is None:
        raise HTTPException(
            status_code=404, detail=f"Quote not available for ticker {ticker}"
        )
    cached = CachedQuote(ticker=ticker, current_price=cached_price)
    return {"success": True, "data": cached, "error": None}


@router.get("/info/{ticker}", response_model=ApiResponse[CompanyInfo])
def get_ticker_info(ticker: str) -> dict[str, object]:
    """Company details used to auto-fill a new holding."""
    info = MarketDataService.fetch_company_info(ticker)
    return {"success": True, "data": info, "error": None}


@router.get("/history/{ticker}", response_model=ApiResponse[list[PricePoint]])
def get_history(ticker: str, period: str = Query(default="30d")) -> dict[str, object]:
    """Historical prices for a ticker: period is "7d", "30d", "90d" or "1y"."""
    history = MarketDataService.fetch_history(ticker, period)
    return {"success": True, "data": history, "error": None}
