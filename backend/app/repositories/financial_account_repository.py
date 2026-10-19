"""Repository for FinancialAccount CRUD operations."""

from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.schemas.financial_account import FinancialAccountCreate, FinancialAccountUpdate


class FinancialAccountRepository:

    @staticmethod
    def get_all(db: Session) -> list[FinancialAccount]:
        return list(
            db.query(FinancialAccount)
            .order_by(FinancialAccount.account_type, FinancialAccount.name)
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, account_id: int) -> FinancialAccount | None:
        return db.query(FinancialAccount).filter(FinancialAccount.id == account_id).first()

    @staticmethod
    def create(db: Session, data: FinancialAccountCreate) -> FinancialAccount:
        account = FinancialAccount(
            name=data.name,
            institution=data.institution,
            account_type=data.account_type,
            balance=data.balance,
            notes=data.notes,
        )
        try:
            db.add(account)
            db.commit()
            db.refresh(account)
            return account
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def update(
        db: Session, account: FinancialAccount, data: FinancialAccountUpdate
    ) -> FinancialAccount:
        if data.name is not None:
            account.name = data.name
        if data.institution is not None:
            account.institution = data.institution
        if data.balance is not None:
            account.balance = data.balance
        if data.notes is not None:
            account.notes = data.notes
        try:
            db.commit()
            db.refresh(account)
            return account
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def get_by_plaid_account_id(db: Session, plaid_account_id: str) -> FinancialAccount | None:
        return (
            db.query(FinancialAccount)
            .filter(FinancialAccount.plaid_account_id == plaid_account_id)
            .first()
        )

    @staticmethod
    def get_by_plaid_item_id(db: Session, plaid_item_id: int) -> list[FinancialAccount]:
        return list(
            db.query(FinancialAccount)
            .filter(FinancialAccount.plaid_item_id == plaid_item_id)
            .all()
        )

    @staticmethod
    def delete(db: Session, account: FinancialAccount) -> None:
        try:
            db.delete(account)
            db.commit()
        except Exception:
            db.rollback()
            raise
