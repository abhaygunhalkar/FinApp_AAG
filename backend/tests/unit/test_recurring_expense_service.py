"""Unit tests for RecurringExpenseService."""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.schemas.recurring_expense import RecurringExpenseCreate, RecurringExpenseUpdate
from app.services.recurring_expense_service import RecurringExpenseService


def _create(db: Session, **overrides: object) -> int:
    data = {
        "name": "Electricity",
        "category": "Utilities",
        "amount": 120.0,
        "frequency": "monthly",
        **overrides,
    }
    return RecurringExpenseService.create(db, RecurringExpenseCreate(**data)).id


@pytest.mark.parametrize(
    ("amount", "frequency", "expected"),
    [
        (100.0, "monthly", 100.0),
        (1200.0, "annual", 100.0),
        (300.0, "quarterly", 100.0),
        (600.0, "semiannual", 100.0),
        (120.0, "weekly", 520.0),
        (120.0, "biweekly", 260.0),
    ],
)
def test_monthly_amount(amount: float, frequency: str, expected: float) -> None:
    assert RecurringExpenseService.monthly_amount(amount, frequency) == expected


def test_create_trims_text_and_stores_blanks_as_none(db_session: Session) -> None:
    expense = RecurringExpenseService.create(
        db_session,
        RecurringExpenseCreate(
            name="  Internet  ",
            category="Utilities",
            amount=70.456,
            frequency="monthly",
            next_due_date=date(2026, 11, 1),
            paid_from="   ",
            autopay=True,
            notes="",
        ),
    )
    assert expense.name == "Internet"
    assert expense.amount == 70.46
    assert expense.paid_from is None
    assert expense.notes is None
    assert expense.autopay is True
    assert expense.monthly_amount == 70.46


def test_get_all_orders_by_category_then_name(db_session: Session) -> None:
    _create(db_session, name="Water", category="Utilities")
    _create(db_session, name="Mortgage", category="Housing", amount=2000.0)
    _create(db_session, name="Electricity", category="Utilities")
    names = [e.name for e in RecurringExpenseService.get_all(db_session)]
    assert names == ["Mortgage", "Electricity", "Water"]


def test_update_changes_only_sent_fields(db_session: Session) -> None:
    expense_id = _create(db_session, paid_from="Checking", notes="Average bill")
    updated = RecurringExpenseService.update(
        db_session,
        expense_id,
        RecurringExpenseUpdate(amount=1440.0, frequency="annual"),
    )
    assert updated.amount == 1440.0
    assert updated.frequency == "annual"
    assert updated.monthly_amount == 120.0
    assert updated.name == "Electricity"
    assert updated.paid_from == "Checking"
    assert updated.notes == "Average bill"


def test_update_can_clear_optional_fields(db_session: Session) -> None:
    expense_id = _create(db_session, next_due_date=date(2026, 11, 8), notes="x")
    updated = RecurringExpenseService.update(
        db_session, expense_id, RecurringExpenseUpdate(next_due_date=None, notes=None)
    )
    assert updated.next_due_date is None
    assert updated.notes is None


def test_update_missing_raises(db_session: Session) -> None:
    with pytest.raises(ValueError, match="not found"):
        RecurringExpenseService.update(
            db_session, 999, RecurringExpenseUpdate(amount=5.0)
        )


def test_delete(db_session: Session) -> None:
    expense_id = _create(db_session)
    RecurringExpenseService.delete(db_session, expense_id)
    assert RecurringExpenseService.get_all(db_session) == []


def test_delete_missing_raises(db_session: Session) -> None:
    with pytest.raises(ValueError, match="not found"):
        RecurringExpenseService.delete(db_session, 999)
