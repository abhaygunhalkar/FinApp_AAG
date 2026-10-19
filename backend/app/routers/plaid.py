"""Plaid integration router: link tokens, token exchange, sync, disconnect."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.plaid_item_repository import PlaidItemRepository
from app.repositories.financial_account_repository import FinancialAccountRepository
from app.schemas.common import ApiResponse
from app.services.plaid_service import PlaidService

router = APIRouter(prefix="/api/plaid", tags=["plaid"])


class ExchangeTokenRequest(BaseModel):
    public_token: str


@router.post("/link-token", response_model=ApiResponse[dict])
def create_link_token() -> dict:
    link_token = PlaidService.create_link_token()
    return {"success": True, "data": {"link_token": link_token}, "error": None}


@router.post("/exchange-token", response_model=ApiResponse[dict])
def exchange_token(body: ExchangeTokenRequest, db: Session = Depends(get_db)) -> dict:
    result = PlaidService.exchange_public_token(db, body.public_token)
    return {"success": True, "data": result, "error": None}


@router.get("/items", response_model=ApiResponse[list])
def get_items(db: Session = Depends(get_db)) -> dict:
    items = PlaidItemRepository.get_all(db)
    data = []
    for item in items:
        account_count = len(FinancialAccountRepository.get_by_plaid_item_id(db, item.id))
        data.append({
            "id": item.id,
            "item_id": item.item_id,
            "institution_name": item.institution_name,
            "last_synced": item.last_synced.isoformat() if item.last_synced else None,
            "account_count": account_count,
        })
    return {"success": True, "data": data, "error": None}


@router.post("/sync", response_model=ApiResponse[dict])
def sync_all(db: Session = Depends(get_db)) -> dict:
    result = PlaidService.sync_all(db)
    return {"success": True, "data": result, "error": None}


@router.delete("/items/{item_id}", response_model=ApiResponse[None])
def disconnect_item(item_id: str, db: Session = Depends(get_db)) -> dict:
    PlaidService.disconnect_item(db, item_id)
    return {"success": True, "data": None, "error": None}
