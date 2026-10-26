"""Business logic for income sources and the monthly cash flow summary."""

from sqlalchemy.orm import Session

from app.models.income_source import IncomeSource
from app.repositories.financial_account_repository import FinancialAccountRepository
from app.repositories.income_repository import IncomeRepository
from app.repositories.recurring_expense_repository import RecurringExpenseRepository
from app.schemas.income import (
    CashFlowSummary,
    IncomeSourceCreate,
    IncomeSourceResponse,
    IncomeSourceUpdate,
)
from app.services.recurring_expense_service import RecurringExpenseService

# Account types counted as cash on hand; matches LIQUID_TYPES on the Net Worth page.
LIQUID_ACCOUNT_TYPES = {"checking", "savings"}


class IncomeNotFoundError(ValueError):
    """Raised when an income source ID does not exist."""


class IncomeService:
    """Service layer for income sources and cash flow."""

    @staticmethod
    def get_all(db: Session) -> list[IncomeSourceResponse]:
        """Retrieve all income sources."""
        return [IncomeService._to_response(i) for i in IncomeRepository.get_all(db)]

    @staticmethod
    def create(db: Session, data: IncomeSourceCreate) -> IncomeSourceResponse:
        """Create an income source."""
        income = IncomeSource(
            name=data.name.strip(),
            category=data.category,
            amount=round(data.amount, 2),
            frequency=data.frequency,
            deposited_to=IncomeService._clean(data.deposited_to),
            notes=IncomeService._clean(data.notes),
        )
        return IncomeService._to_response(IncomeRepository.create(db, income))

    @staticmethod
    def update(
        db: Session, income_id: int, data: IncomeSourceUpdate
    ) -> IncomeSourceResponse:
        """Update the fields that were sent.

        Raises:
            IncomeNotFoundError: If the income source does not exist.
        """
        income = IncomeRepository.get_by_id(db, income_id)
        if income is None:
            raise IncomeNotFoundError(f"Income source {income_id} not found")

        fields = data.model_dump(exclude_unset=True)
        if fields.get("name") is not None:
            income.name = fields["name"].strip()
        if fields.get("category") is not None:
            income.category = fields["category"]
        if fields.get("amount") is not None:
            income.amount = round(fields["amount"], 2)
        if fields.get("frequency") is not None:
            income.frequency = fields["frequency"]
        if "deposited_to" in fields:
            income.deposited_to = IncomeService._clean(fields["deposited_to"])
        if "notes" in fields:
            income.notes = IncomeService._clean(fields["notes"])

        return IncomeService._to_response(IncomeRepository.update(db, income))

    @staticmethod
    def delete(db: Session, income_id: int) -> None:
        """Delete an income source.

        Raises:
            IncomeNotFoundError: If the income source does not exist.
        """
        income = IncomeRepository.get_by_id(db, income_id)
        if income is None:
            raise IncomeNotFoundError(f"Income source {income_id} not found")
        IncomeRepository.delete(db, income)

    @staticmethod
    def get_cash_flow_summary(db: Session) -> CashFlowSummary:
        """Monthly income vs fixed costs, plus emergency-fund coverage."""
        monthly = RecurringExpenseService.monthly_amount
        income = round(
            sum(monthly(i.amount, i.frequency) for i in IncomeRepository.get_all(db)), 2
        )
        fixed = round(
            sum(
                monthly(e.amount, e.frequency)
                for e in RecurringExpenseRepository.get_all(db)
            ),
            2,
        )
        liquid = round(
            sum(
                a.balance
                for a in FinancialAccountRepository.get_all(db)
                if a.account_type in LIQUID_ACCOUNT_TYPES
            ),
            2,
        )
        surplus = round(income - fixed, 2)
        return CashFlowSummary(
            monthly_income=income,
            monthly_fixed_costs=fixed,
            monthly_surplus=surplus,
            kept_pct=round(surplus / income * 100, 1) if income > 0 else None,
            liquid_cash=liquid,
            emergency_months=round(liquid / fixed, 1) if fixed > 0 else None,
        )

    @staticmethod
    def _clean(value: str | None) -> str | None:
        """Trim optional text and store blanks as NULL."""
        if value is None:
            return None
        value = value.strip()
        return value or None

    @staticmethod
    def _to_response(income: IncomeSource) -> IncomeSourceResponse:
        return IncomeSourceResponse(
            id=income.id,
            name=income.name,
            category=income.category,
            amount=income.amount,
            frequency=income.frequency,
            monthly_amount=RecurringExpenseService.monthly_amount(
                income.amount, income.frequency
            ),
            deposited_to=income.deposited_to,
            notes=income.notes,
            created_at=income.created_at,
            updated_at=income.updated_at,
        )
