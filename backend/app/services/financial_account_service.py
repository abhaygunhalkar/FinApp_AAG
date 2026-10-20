"""Service layer for financial accounts and net worth calculations."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.repositories.financial_account_repository import FinancialAccountRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.net_worth_snapshot_repository import NetWorthSnapshotRepository
from app.repositories.plaid_item_repository import PlaidItemRepository
from app.schemas.financial_account import (
    ASSET_TYPES,
    FinancialAccountCreate,
    FinancialAccountResponse,
    FinancialAccountUpdate,
    NetWorthSnapshotResponse,
    NetWorthSummaryResponse,
)


class FinancialAccountService:

    @staticmethod
    def _is_asset(account_type: str) -> bool:
        return account_type in ASSET_TYPES

    @staticmethod
    def _sync_times(db: Session) -> dict[int, datetime | None]:
        return {item.id: item.last_synced for item in PlaidItemRepository.get_all(db)}

    @staticmethod
    def _to_response(
        account: FinancialAccount, sync_times: dict[int, datetime | None]
    ) -> FinancialAccountResponse:
        is_linked = account.plaid_item_id is not None
        return FinancialAccountResponse(
            id=account.id,
            name=account.name,
            institution=account.institution,
            account_type=account.account_type,
            balance=account.balance,
            is_asset=FinancialAccountService._is_asset(account.account_type),
            notes=account.notes,
            credit_limit=account.credit_limit,
            original_amount=account.original_amount,
            apr=account.apr,
            due_date=account.due_date,
            payoff_date=account.payoff_date,
            is_linked=is_linked,
            # Linked accounts report the institution's last sync;
            # manual ones their last edit.
            last_synced=(
                sync_times.get(account.plaid_item_id)
                if account.plaid_item_id is not None
                else account.updated_at
            ),
            created_at=account.created_at,
            updated_at=account.updated_at,
        )

    @staticmethod
    def _portfolio_value(db: Session) -> float:
        return sum(h.current_price * h.quantity for h in HoldingsRepository.get_all(db))

    @staticmethod
    def get_summary(db: Session) -> NetWorthSummaryResponse:
        """Net worth totals. Stock/ETF holdings count as assets alongside accounts,
        so the headline and every snapshot are computed the same way."""
        accounts = FinancialAccountRepository.get_all(db)
        portfolio_value = round(FinancialAccountService._portfolio_value(db), 2)
        total_assets = round(
            sum(a.balance for a in accounts if a.account_type in ASSET_TYPES)
            + portfolio_value,
            2,
        )
        total_liabilities = round(
            sum(a.balance for a in accounts if a.account_type not in ASSET_TYPES), 2
        )
        return NetWorthSummaryResponse(
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            net_worth=round(total_assets - total_liabilities, 2),
            portfolio_value=portfolio_value,
        )

    @staticmethod
    def _snapshot(db: Session) -> None:
        summary = FinancialAccountService.get_summary(db)
        NetWorthSnapshotRepository.upsert_today(
            db, summary.total_assets, summary.total_liabilities, summary.net_worth
        )

    @staticmethod
    def record_snapshot(db: Session) -> None:
        """Record today's snapshot; called by the background refresh job so the
        trend has a point every day, not only on days an account is edited."""
        FinancialAccountService._snapshot(db)

    @staticmethod
    def get_all(db: Session) -> list[FinancialAccountResponse]:
        sync_times = FinancialAccountService._sync_times(db)
        return [
            FinancialAccountService._to_response(a, sync_times)
            for a in FinancialAccountRepository.get_all(db)
        ]

    @staticmethod
    def create(db: Session, data: FinancialAccountCreate) -> FinancialAccountResponse:
        account = FinancialAccountRepository.create(db, data)
        FinancialAccountService._snapshot(db)
        return FinancialAccountService._to_response(
            account, FinancialAccountService._sync_times(db)
        )

    @staticmethod
    def update(
        db: Session, account_id: int, data: FinancialAccountUpdate
    ) -> FinancialAccountResponse:
        account = FinancialAccountRepository.get_by_id(db, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        account = FinancialAccountRepository.update(db, account, data)
        FinancialAccountService._snapshot(db)
        return FinancialAccountService._to_response(
            account, FinancialAccountService._sync_times(db)
        )

    @staticmethod
    def delete(db: Session, account_id: int) -> None:
        account = FinancialAccountRepository.get_by_id(db, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        FinancialAccountRepository.delete(db, account)
        FinancialAccountService._snapshot(db)

    @staticmethod
    def get_snapshots(db: Session) -> list[NetWorthSnapshotResponse]:
        return [
            NetWorthSnapshotResponse.model_validate(s)
            for s in NetWorthSnapshotRepository.get_all(db)
        ]
