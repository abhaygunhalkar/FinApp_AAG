"""Business logic for income sources and the monthly cash flow summary."""

from datetime import date

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
from app.services import account_link, pay_schedule
from app.services.recurring_expense_service import RecurringExpenseService

# Account types counted as cash on hand; matches LIQUID_TYPES on the Net Worth page.
LIQUID_ACCOUNT_TYPES = {"checking", "savings"}
# Income can only be deposited to a bank account.
DEPOSIT_ACCOUNT_TYPES = LIQUID_ACCOUNT_TYPES


class IncomeNotFoundError(ValueError):
    """Raised when an income source ID does not exist."""


def _tidy_schedule(income: IncomeSource) -> None:
    """Keep only the schedule fields the frequency uses, and check them.

    Raises:
        ValueError: If a twice-a-month schedule has one day, or the same day twice.
    """
    if income.frequency != "semimonthly":
        income.pay_day_1 = income.pay_day_2 = None
        return
    income.pay_date = None
    days = (income.pay_day_1, income.pay_day_2)
    if days.count(None) == 1:
        raise ValueError("Twice-a-month income needs both pay days")
    if days[0] is not None and days[0] == days[1]:
        raise ValueError("Pick two different pay days")
    if days[0] is not None and days[1] is not None and days[0] > days[1]:
        income.pay_day_1, income.pay_day_2 = days[1], days[0]


class IncomeService:
    """Service layer for income sources and cash flow."""

    @staticmethod
    def get_all(db: Session, today: date | None = None) -> list[IncomeSourceResponse]:
        """Retrieve all income sources."""
        labels = account_link.account_labels(db)
        return [
            IncomeService._to_response(db, i, labels, today)
            for i in IncomeRepository.get_all(db)
        ]

    @staticmethod
    def create(db: Session, data: IncomeSourceCreate) -> IncomeSourceResponse:
        """Create an income source.

        Raises:
            ValueError: If the linked account doesn't exist or isn't a bank
                account, or the pay schedule is incomplete.
        """
        account_id, deposited_to = account_link.link_from_create(
            db, data.deposited_to_account_id, data.deposited_to, DEPOSIT_ACCOUNT_TYPES
        )
        income = IncomeSource(
            name=data.name.strip(),
            category=data.category,
            amount=round(data.amount, 2),
            frequency=data.frequency,
            deposited_to_account_id=account_id,
            deposited_to=deposited_to,
            pay_date=data.pay_date,
            pay_day_1=data.pay_day_1,
            pay_day_2=data.pay_day_2,
            weekend_rule=data.weekend_rule,
            notes=account_link.clean_text(data.notes),
        )
        _tidy_schedule(income)
        return IncomeService._to_response(db, IncomeRepository.create(db, income))

    @staticmethod
    def update(
        db: Session, income_id: int, data: IncomeSourceUpdate
    ) -> IncomeSourceResponse:
        """Update the fields that were sent.

        Raises:
            IncomeNotFoundError: If the income source does not exist.
            ValueError: If the linked account doesn't exist or isn't a bank
                account, or the pay schedule is incomplete.
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
        income.deposited_to_account_id, income.deposited_to = (
            account_link.link_from_update(
                db,
                fields,
                "deposited_to_account_id",
                "deposited_to",
                (income.deposited_to_account_id, income.deposited_to),
                DEPOSIT_ACCOUNT_TYPES,
            )
        )
        for key in ("pay_date", "pay_day_1", "pay_day_2"):
            if key in fields:
                setattr(income, key, fields[key])
        if fields.get("weekend_rule") is not None:
            income.weekend_rule = fields["weekend_rule"]
        if "notes" in fields:
            income.notes = account_link.clean_text(fields["notes"])
        _tidy_schedule(income)

        return IncomeService._to_response(db, IncomeRepository.update(db, income))

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
    def _to_response(
        db: Session,
        income: IncomeSource,
        labels: dict[int, str] | None = None,
        today: date | None = None,
    ) -> IncomeSourceResponse:
        return IncomeSourceResponse(
            id=income.id,
            name=income.name,
            category=income.category,
            amount=income.amount,
            frequency=income.frequency,
            monthly_amount=RecurringExpenseService.monthly_amount(
                income.amount, income.frequency
            ),
            deposited_to_account_id=income.deposited_to_account_id,
            deposited_to=account_link.display_label(
                db, income.deposited_to_account_id, income.deposited_to, labels
            ),
            pay_date=income.pay_date,
            pay_day_1=income.pay_day_1,
            pay_day_2=income.pay_day_2,
            weekend_rule=income.weekend_rule,
            next_pay_date=pay_schedule.next_pay_date(income, today or date.today()),
            notes=income.notes,
            created_at=income.created_at,
            updated_at=income.updated_at,
        )
