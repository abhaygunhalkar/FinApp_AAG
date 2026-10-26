"""Unit tests for IncomeService and the cash flow summary."""

import pytest
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.schemas.income import IncomeSourceCreate, IncomeSourceUpdate
from app.schemas.recurring_expense import RecurringExpenseCreate
from app.services.income_service import IncomeNotFoundError, IncomeService
from app.services.recurring_expense_service import RecurringExpenseService


def _income(db: Session, **overrides: object) -> int:
    data = {
        "name": "Salary",
        "category": "Salary",
        "amount": 3000.0,
        "frequency": "biweekly",
    }
    data.update(overrides)
    return IncomeService.create(db, IncomeSourceCreate(**data)).id


def _bill(db: Session, amount: float, frequency: str = "monthly") -> None:
    RecurringExpenseService.create(
        db,
        RecurringExpenseCreate(
            name="Bill", category="Housing", amount=amount, frequency=frequency
        ),
    )


def _account(db: Session, account_type: str, balance: float) -> None:
    db.add(
        FinancialAccount(name=account_type, account_type=account_type, balance=balance)
    )
    db.commit()


def test_create_normalises_to_monthly_and_cleans_text(db_session: Session) -> None:
    income = IncomeService.create(
        db_session,
        IncomeSourceCreate(
            name="  Paycheck ",
            category="Salary",
            amount=3000.004,
            frequency="biweekly",
            deposited_to="  ",
            notes="",
        ),
    )
    assert income.name == "Paycheck"
    assert income.amount == 3000.0
    assert income.monthly_amount == 6500.0  # 3000 * 26 / 12
    assert income.deposited_to is None
    assert income.notes is None


def test_update_changes_only_sent_fields(db_session: Session) -> None:
    income_id = _income(db_session, deposited_to="Checking")
    updated = IncomeService.update(
        db_session, income_id, IncomeSourceUpdate(amount=7000.0, frequency="monthly")
    )
    assert updated.monthly_amount == 7000.0
    assert updated.deposited_to == "Checking"
    assert updated.name == "Salary"


def test_update_and_delete_missing_raise(db_session: Session) -> None:
    with pytest.raises(IncomeNotFoundError):
        IncomeService.update(db_session, 999, IncomeSourceUpdate(amount=1.0))
    with pytest.raises(IncomeNotFoundError):
        IncomeService.delete(db_session, 999)


def test_delete(db_session: Session) -> None:
    income_id = _income(db_session)
    IncomeService.delete(db_session, income_id)
    assert IncomeService.get_all(db_session) == []


def test_cash_flow_summary(db_session: Session) -> None:
    _income(db_session)  # 6,500 / mo
    _income(
        db_session,
        name="Rent from basement",
        category="Rental income",
        amount=1200.0,
        frequency="monthly",
    )
    _bill(db_session, 3000.0)
    _bill(db_session, 1200.0, "annual")  # 100 / mo
    _account(db_session, "checking", 5_000.0)
    _account(db_session, "savings", 20_000.0)
    _account(db_session, "investment", 100_000.0)  # not liquid
    _account(db_session, "credit_card", 2_000.0)  # liability, not liquid

    s = IncomeService.get_cash_flow_summary(db_session)
    assert s.monthly_income == 7700.0
    assert s.monthly_fixed_costs == 3100.0
    assert s.monthly_surplus == 4600.0
    assert s.kept_pct == 59.7
    assert s.liquid_cash == 25_000.0
    assert s.emergency_months == 8.1


def test_cash_flow_summary_empty(db_session: Session) -> None:
    s = IncomeService.get_cash_flow_summary(db_session)
    assert s.monthly_income == 0
    assert s.kept_pct is None
    assert s.emergency_months is None


def test_cash_flow_summary_negative_surplus(db_session: Session) -> None:
    _income(db_session, amount=2000.0, frequency="monthly")
    _bill(db_session, 2500.0)
    s = IncomeService.get_cash_flow_summary(db_session)
    assert s.monthly_surplus == -500.0
    assert s.kept_pct == -25.0
