"""Service for Plaid API interactions: link tokens, token exchange, account sync."""

import logging

import plaid
from fastapi import HTTPException
from plaid import ApiClient, Configuration
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.institutions_get_by_id_request import InstitutionsGetByIdRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.item_remove_request import ItemRemoveRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.financial_account import FinancialAccount
from app.models.plaid_item import PlaidItem as plaid_item_type
from app.repositories.financial_account_repository import FinancialAccountRepository
from app.repositories.plaid_item_repository import PlaidItemRepository
from app.services.financial_account_service import FinancialAccountService

logger = logging.getLogger(__name__)

ENV_MAP = {
    "sandbox": plaid.Environment.Sandbox,
    "development": plaid.Environment.Development,
    "production": plaid.Environment.Production,
}

ASSET_TYPES = {"checking", "savings", "investment", "real_estate", "vehicle", "other_asset"}

SUBTYPE_MAP: dict[str, str] = {
    "checking": "checking",
    "savings": "savings",
    "money market": "savings",
    "cd": "savings",
    "credit card": "credit_card",
    "mortgage": "mortgage",
    "home equity": "mortgage",
    "auto": "loan",
    "student": "loan",
    "personal": "loan",
    "brokerage": "investment",
    "401k": "investment",
    "ira": "investment",
    "roth": "investment",
    "roth 401k": "investment",
    "529": "investment",
    "real estate": "real_estate",
}

LIABILITY_PLAID_TYPES = {"credit", "loan"}


class PlaidService:

    @staticmethod
    def _get_client() -> plaid_api.PlaidApi:
        settings = get_settings()
        if not settings.PLAID_CLIENT_ID or not settings.PLAID_SECRET:
            raise HTTPException(status_code=503, detail="Plaid credentials not configured")
        host = ENV_MAP.get(settings.PLAID_ENV, plaid.Environment.Sandbox)
        configuration = Configuration(
            host=host,
            api_key={"clientId": settings.PLAID_CLIENT_ID, "secret": settings.PLAID_SECRET},
        )
        api_client = ApiClient(configuration)
        return plaid_api.PlaidApi(api_client)

    @staticmethod
    def create_link_token(user_id: str = "local-user") -> str:
        client = PlaidService._get_client()
        request = LinkTokenCreateRequest(
            user=LinkTokenCreateRequestUser(client_user_id=user_id),
            client_name="FinApp",
            products=[Products("transactions")],
            country_codes=[CountryCode("US")],
            language="en",
        )
        response = client.link_token_create(request)
        return response["link_token"]

    @staticmethod
    def exchange_public_token(db: Session, public_token: str) -> dict:
        client = PlaidService._get_client()

        exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
        exchange_response = client.item_public_token_exchange(exchange_request)
        access_token: str = exchange_response["access_token"]
        item_id: str = exchange_response["item_id"]

        institution_id: str | None = None
        institution_name: str | None = None
        try:
            item_response = client.item_get({"access_token": access_token})
            institution_id = item_response["item"].get("institution_id")
            if institution_id:
                inst_response = client.institutions_get_by_id(
                    InstitutionsGetByIdRequest(
                        institution_id=institution_id,
                        country_codes=[CountryCode("US")],
                    )
                )
                institution_name = inst_response["institution"]["name"]
        except Exception as exc:
            logger.warning("Could not fetch institution info: %s", exc)

        plaid_item = PlaidItemRepository.create(
            db, item_id, access_token, institution_id, institution_name
        )

        accounts_synced = PlaidService.sync_item(db, plaid_item)
        return {
            "item_id": item_id,
            "institution_name": institution_name or "Unknown Institution",
            "accounts_synced": accounts_synced,
        }

    @staticmethod
    def sync_item(db: Session, plaid_item: plaid_item_type) -> int:
        client = PlaidService._get_client()

        accounts_request = AccountsGetRequest(access_token=plaid_item.access_token)
        accounts_response = client.accounts_get(accounts_request)
        accounts = accounts_response["accounts"]

        synced = 0
        for acct in accounts:
            plaid_account_id: str = acct["account_id"]
            subtype_raw: str = str(acct.get("subtype") or "").lower()
            plaid_type: str = str(acct.get("type") or "").lower()

            account_type = SUBTYPE_MAP.get(subtype_raw)
            if account_type is None:
                account_type = "other_liability" if plaid_type in LIABILITY_PLAID_TYPES else "other_asset"

            raw_balance = acct["balances"].get("current") or 0.0
            is_liability = account_type not in ASSET_TYPES
            balance = abs(float(raw_balance)) if is_liability else float(raw_balance)

            name: str = acct.get("name") or acct.get("official_name") or "Account"
            institution_name = plaid_item.institution_name or ""

            existing = FinancialAccountRepository.get_by_plaid_account_id(db, plaid_account_id)
            if existing:
                existing.balance = balance
                existing.name = name
                existing.institution = institution_name
                db.add(existing)
            else:
                new_acct = FinancialAccount(
                    name=name,
                    institution=institution_name,
                    account_type=account_type,
                    balance=balance,
                    plaid_account_id=plaid_account_id,
                    plaid_item_id=plaid_item.id,
                )
                db.add(new_acct)
            synced += 1

        db.commit()
        PlaidItemRepository.update_last_synced(db, plaid_item)
        FinancialAccountService._snapshot(db)
        return synced

    @staticmethod
    def sync_all(db: Session) -> dict:
        items = PlaidItemRepository.get_all(db)
        total_accounts = 0
        for item in items:
            try:
                total_accounts += PlaidService.sync_item(db, item)
            except Exception as exc:
                logger.error("Failed to sync Plaid item %s: %s", item.item_id, exc)
        return {"items_synced": len(items), "accounts_updated": total_accounts}

    @staticmethod
    def disconnect_item(db: Session, item_id: str) -> None:
        plaid_item = PlaidItemRepository.get_by_item_id(db, item_id)
        if plaid_item is None:
            raise HTTPException(status_code=404, detail="Plaid item not found")

        try:
            client = PlaidService._get_client()
            client.item_remove(ItemRemoveRequest(access_token=plaid_item.access_token))
        except Exception as exc:
            logger.warning("Plaid item/remove API call failed (continuing): %s", exc)

        linked_accounts = FinancialAccountRepository.get_by_plaid_item_id(db, plaid_item.id)
        for acct in linked_accounts:
            acct.plaid_account_id = None
            acct.plaid_item_id = None
            db.add(acct)
        db.commit()

        PlaidItemRepository.delete(db, plaid_item)
