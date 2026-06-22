"""Options trades API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.options import OptionQuoteResponse, OptionsTradeResponse, OptionsTradeCreate, OptionsSummary
from app.services.options_service import OptionsService

router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("", response_model=ApiResponse[list[OptionsTradeResponse]])
def list_options(db: Session = Depends(get_db)) -> ApiResponse[list[OptionsTradeResponse]]:
    trades = OptionsService.list_trades(db)
    return ApiResponse(success=True, data=trades, error=None)


@router.get("/summary", response_model=ApiResponse[OptionsSummary])
def options_summary(db: Session = Depends(get_db)) -> ApiResponse[OptionsSummary]:
    summary = OptionsService.get_summary(db)
    return ApiResponse(success=True, data=summary, error=None)


@router.get("/quotes", response_model=ApiResponse[dict[int, OptionQuoteResponse]])
def get_open_trade_quotes(db: Session = Depends(get_db)) -> ApiResponse[dict[int, OptionQuoteResponse]]:
    """Live bid/ask quotes and unrealized P&L for every open options trade."""
    quotes = OptionsService.get_open_trade_quotes(db)
    return ApiResponse(success=True, data=quotes, error=None)


@router.get("/{id}", response_model=ApiResponse[OptionsTradeResponse])
def get_option(id: int, db: Session = Depends(get_db)) -> ApiResponse[OptionsTradeResponse]:
    trade = OptionsService.get_trade(db, id)
    if not trade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Options trade not found")
    return ApiResponse(success=True, data=trade, error=None)


@router.post("", response_model=ApiResponse[OptionsTradeResponse], status_code=status.HTTP_201_CREATED)
def create_option(payload: OptionsTradeCreate, db: Session = Depends(get_db)) -> ApiResponse[OptionsTradeResponse]:
    created = OptionsService.create_trade(db, payload.model_dump())
    return ApiResponse(success=True, data=created, error=None)


@router.put("/{id}", response_model=ApiResponse[OptionsTradeResponse])
def update_option(id: int, payload: OptionsTradeCreate, db: Session = Depends(get_db)) -> ApiResponse[OptionsTradeResponse]:
    updated = OptionsService.update_trade(db, id, payload.model_dump())
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Options trade not found")
    return ApiResponse(success=True, data=updated, error=None)


@router.delete("/{id}", response_model=ApiResponse[None])
def delete_option(id: int, db: Session = Depends(get_db)) -> ApiResponse[None]:
    OptionsService.delete_trade(db, id)
    return ApiResponse(success=True, data=None, error=None)
