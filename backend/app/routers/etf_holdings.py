"""ETF holdings API router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.holding import HoldingCreate, HoldingResponse, HoldingUpdate
from app.services.holdings_service import HoldingsService

router = APIRouter(prefix="/api/etf-holdings", tags=["etf-holdings"])

# Service errors (404 and so on) are HTTPExceptions; the app-wide handler
# turns them into the error envelope.


@router.get("", response_model=ApiResponse[list[HoldingResponse]])
def get_etf_holdings(db: Session = Depends(get_db)) -> dict[str, object]:
    """Retrieve all ETF holdings with calculated metrics."""
    holdings = HoldingsService.get_all_holdings(db, holding_type="etf")
    return {"success": True, "data": holdings, "error": None}


@router.get("/{holding_id}", response_model=ApiResponse[HoldingResponse])
def get_etf_holding(
    holding_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Retrieve one ETF holding."""
    holding = HoldingsService.get_holding(db, holding_id, holding_type="etf")
    return {"success": True, "data": holding, "error": None}


@router.post("", response_model=ApiResponse[HoldingResponse], status_code=201)
def create_etf_holding(
    data: HoldingCreate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Create a new ETF holding with an initial buy transaction."""
    try:
        holding = HoldingsService.create_holding(db, data, holding_type="etf")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "data": holding, "error": None}


@router.put("/{holding_id}", response_model=ApiResponse[HoldingResponse])
def update_etf_holding(
    holding_id: int, data: HoldingUpdate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Update editable fields of a ETF holding."""
    holding = HoldingsService.update_holding(db, holding_id, data, holding_type="etf")
    return {"success": True, "data": holding, "error": None}


@router.delete("/{holding_id}", response_model=ApiResponse[None])
def delete_etf_holding(
    holding_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Delete a ETF holding and return the invested amount to cash."""
    HoldingsService.delete_holding(db, holding_id, holding_type="etf")
    return {"success": True, "data": None, "error": None}
