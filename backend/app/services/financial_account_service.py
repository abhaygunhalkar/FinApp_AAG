"""Service layer for financial accounts and net worth calculations."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories.financial_account_repository import FinancialAccountRepository
from app.repositories.net_worth_snapshot_repository import NetWorthSnapshotRepository
from app.schemas.financial_account import (
    ASSET_TYPES,
    FinancialAccountCreate,
    FinancialAccountResponse,
    FinancialAccountUpdate,
    NetWorthSnapshotResponse,
    NetWorthSummaryResponse,
)
from app.models.financial_account import FinancialAccount


class FinancialAccountService:

    @staticmethod
    def _is_asset(account_type: str) -> bool:
        return account_type in ASSET_TYPES

    @staticmethod
    def _to_response(account: FinancialAccount) -> FinancialAccountResponse:
        return FinancialAccountResponse(
            id=account.id,
            name=account.name,
            institution=account.institution,
            account_type=account.account_type,
            balance=account.balance,
            is_asset=FinancialAccountService._is_asset(account.account_type),
            notes=account.notes,
            created_at=account.created_at,
            updated_at=account.updated_at,
        )

    @staticmethod
    def _snapshot(db: Session) -> None:
        accounts = FinancialAccountRepository.get_all(db)
        total_assets = round(
            sum(a.balance for a in accounts if a.account_type in ASSET_TYPES), 2
        )
        total_liabilities = round(
            sum(a.balance for a in accounts if a.account_type not in ASSET_TYPES), 2
        )
        NetWorthSnapshotRepository.upsert_today(
            db, total_assets, total_liabilities, round(total_assets - total_liabilities, 2)
        )

    @staticmethod
    def get_all(db: Session) -> list[FinancialAccountResponse]:
        return [
            FinancialAccountService._to_response(a)
            for a in FinancialAccountRepository.get_all(db)
        ]

    @staticmethod
    def create(db: Session, data: FinancialAccountCreate) -> FinancialAccountResponse:
        account = FinancialAccountRepository.create(db, data)
        FinancialAccountService._snapshot(db)
        return FinancialAccountService._to_response(account)

    @staticmethod
    def update(
        db: Session, account_id: int, data: FinancialAccountUpdate
    ) -> FinancialAccountResponse:
        account = FinancialAccountRepository.get_by_id(db, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        account = FinancialAccountRepository.update(db, account, data)
        FinancialAccountService._snapshot(db)
        return FinancialAccountService._to_response(account)

    @staticmethod
    def delete(db: Session, account_id: int) -> None:
        account = FinancialAccountRepository.get_by_id(db, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        FinancialAccountRepository.delete(db, account)
        FinancialAccountService._snapshot(db)

    @staticmethod
    def get_summary(db: Session) -> NetWorthSummaryResponse:
        accounts = FinancialAccountRepository.get_all(db)
        total_assets = round(
            sum(a.balance for a in accounts if a.account_type in ASSET_TYPES), 2
        )
        total_liabilities = round(
            sum(a.balance for a in accounts if a.account_type not in ASSET_TYPES), 2
        )
        return NetWorthSummaryResponse(
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            net_worth=round(total_assets - total_liabilities, 2),
        )

    @staticmethod
    def get_snapshots(db: Session) -> list[NetWorthSnapshotResponse]:
        return [
            NetWorthSnapshotResponse.model_validate(s)
            for s in NetWorthSnapshotRepository.get_recent(db, days=365)
        ]
