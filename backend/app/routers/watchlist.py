"""Watchlist API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.watchlist import WatchlistCreate, WatchlistResponse, WatchlistUpdate
from app.services.watchlist_service import WatchlistService

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=ApiResponse[list[WatchlistResponse]])
def get_watchlist(db: Session = Depends(get_db)) -> dict[str, object]:
    """Retrieve all watchlist items."""
    return {"success": True, "data": WatchlistService.get_all_items(db), "error": None}


@router.post(
    "",
    response_model=ApiResponse[WatchlistResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_watchlist_item(
    data: WatchlistCreate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Add a new stock to the watchlist."""
    try:
        item = WatchlistService.create_item(db, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": item, "error": None}


@router.put("/{item_id}", response_model=ApiResponse[WatchlistResponse])
def update_watchlist_item(
    item_id: int, data: WatchlistUpdate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Update an existing watchlist item."""
    try:
        item = WatchlistService.update_item(db, item_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"success": True, "data": item, "error": None}


@router.delete("/{item_id}", response_model=ApiResponse[None])
def delete_watchlist_item(
    item_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Remove a stock from the watchlist."""
    try:
        WatchlistService.delete_item(db, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"success": True, "data": None, "error": None}
