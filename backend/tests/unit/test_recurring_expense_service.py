"""Unit tests for RecurringExpenseService."""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.schemas.recurring_expense import RecurringExpenseCreate, RecurringExpenseUpdate
from app.services.recurring_expense_service import (
    ExpenseNotFoundError,
    RecurringExpenseService,
    add_periods,
    roll_forward,
)


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
        (2600.0, "semimonthly", 5200.0),
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


@pytest.mark.parametrize(
    ("start", "frequency", "expected"),
    [
        (date(2026, 10, 28), "weekly", date(2026, 11, 4)),
        (date(2026, 10, 28), "biweekly", date(2026, 11, 11)),
        (date(2026, 10, 6), "semimonthly", date(2026, 10, 21)),
        (date(2026, 10, 22), "semimonthly", date(2026, 11, 6)),
        (date(2026, 10, 28), "monthly", date(2026, 11, 28)),
        (date(2026, 1, 31), "monthly", date(2026, 2, 28)),
        (date(2028, 1, 31), "monthly", date(2028, 2, 29)),
        (date(2026, 11, 15), "quarterly", date(2027, 2, 15)),
        (date(2026, 9, 30), "semiannual", date(2027, 3, 30)),
        (date(2028, 2, 29), "annual", date(2029, 2, 28)),
    ],
)
def test_add_periods(start: date, frequency: str, expected: date) -> None:
    assert add_periods(start, frequency) == expected


def test_roll_forward_catches_up_without_month_drift() -> None:
    # Jan 31 monthly, three periods missed: lands on Apr 30, not Apr 28.
    assert roll_forward(date(2026, 1, 31), "monthly", date(2026, 4, 15)) == date(
        2026, 4, 30
    )
    # Already in the future: unchanged.
    assert roll_forward(date(2026, 11, 1), "monthly", date(2026, 10, 23)) == date(
        2026, 11, 1
    )
    # Due today counts as current, not past.
    assert roll_forward(date(2026, 10, 23), "monthly", date(2026, 10, 23)) == date(
        2026, 10, 23
    )


def test_get_all_rolls_past_autopay_bills_only(db_session: Session) -> None:
    _create(db_session, name="Internet", autopay=True, next_due_date=date(2026, 9, 28))
    _create(db_session, name="Water", autopay=False, next_due_date=date(2026, 9, 28))
    _create(db_session, name="Gym", autopay=True, next_due_date=None)

    result = {
        e.name: e.next_due_date
        for e in RecurringExpenseService.get_all(db_session, today=date(2026, 10, 23))
    }
    assert result["Internet"] == date(2026, 10, 28)
    assert result["Water"] == date(2026, 9, 28)
    assert result["Gym"] is None

    # The rolled date was saved, not just returned.
    again = RecurringExpenseService.get_all(db_session, today=date(2026, 10, 23))
    assert next(e for e in again if e.name == "Internet").next_due_date == date(
        2026, 10, 28
    )


def test_mark_paid_advances_one_period(db_session: Session) -> None:
    expense_id = _create(
        db_session, frequency="quarterly", amount=300.0, next_due_date=date(2026, 9, 15)
    )
    paid = RecurringExpenseService.mark_paid(db_session, expense_id)
    assert paid.next_due_date == date(2026, 12, 15)


def test_mark_paid_without_due_date_raises(db_session: Session) -> None:
    expense_id = _create(db_session)
    with pytest.raises(ValueError, match="no due date"):
        RecurringExpenseService.mark_paid(db_session, expense_id)


def test_mark_paid_missing_raises_not_found(db_session: Session) -> None:
    with pytest.raises(ExpenseNotFoundError):
        RecurringExpenseService.mark_paid(db_session, 999)


def test_semimonthly_alternates_without_drift() -> None:
    start = date(2026, 10, 6)
    steps = [add_periods(start, "semimonthly", n) for n in range(1, 5)]
    assert steps == [
        date(2026, 10, 21),
        date(2026, 11, 6),
        date(2026, 11, 21),
        date(2026, 12, 6),
    ]
    # Rolling forward from a missed date lands on the next half-month slot.
    assert roll_forward(start, "semimonthly", date(2026, 11, 10)) == date(2026, 11, 21)
