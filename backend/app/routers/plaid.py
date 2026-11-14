"""Plaid integration router: link tokens, token exchange, sync, disconnect."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.plaid import (
    ExchangeTokenRequest,
    ExchangeTokenResponse,
    LinkTokenResponse,
    PlaidItemInfo,
    PlaidSyncResponse,
)
from app.services.plaid_service import PlaidService

router = APIRouter(prefix="/api/plaid", tags=["plaid"])


@router.post("/link-token", response_model=ApiResponse[LinkTokenResponse])
def create_link_token() -> dict[str, object]:
    token = LinkTokenResponse(link_token=PlaidService.create_link_token())
    return {"success": True, "data": token, "error": None}


@router.post("/exchange-token", response_model=ApiResponse[ExchangeTokenResponse])
def exchange_token(
    body: ExchangeTokenRequest, db: Session = Depends(get_db)
) -> dict[str, object]:
    result = PlaidService.exchange_public_token(db, body.public_token)
    return {"success": True, "data": result, "error": None}


@router.get("/items", response_model=ApiResponse[list[PlaidItemInfo]])
def get_items(db: Session = Depends(get_db)) -> dict[str, object]:
    return {"success": True, "data": PlaidService.get_items(db), "error": None}


@router.post("/sync", response_model=ApiResponse[PlaidSyncResponse])
def sync_all(db: Session = Depends(get_db)) -> dict[str, object]:
    return {"success": True, "data": PlaidService.sync_all(db), "error": None}


@router.delete("/items/{item_id}", response_model=ApiResponse[None])
def disconnect_item(item_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    PlaidService.disconnect_item(db, item_id)
    return {"success": True, "data": None, "error": None}
