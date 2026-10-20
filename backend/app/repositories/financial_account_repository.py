"""Repository for FinancialAccount CRUD operations."""

from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.schemas.financial_account import (
    FinancialAccountCreate,
    FinancialAccountUpdate,
    LiabilityDetails,
)

LIABILITY_FIELDS = set(LiabilityDetails.model_fields)


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
            **data.model_dump(include=LIABILITY_FIELDS),
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
        # Liability details can be cleared, so apply every field that was sent.
        for field in LIABILITY_FIELDS & data.model_fields_set:
            setattr(account, field, getattr(data, field))
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
