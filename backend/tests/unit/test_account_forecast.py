"""Unit tests for the per-account bill forecast."""

from datetime import date

from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.income_source import IncomeSource
from app.models.recurring_expense import RecurringExpense
from app.services.account_forecast_service import AccountForecastService

TODAY = date(2026, 11, 9)  # a Monday


def _account(db: Session, name: str, account_type: str, balance: float) -> int:
    account = FinancialAccount(name=name, account_type=account_type, balance=balance)
    db.add(account)
    db.commit()
    return account.id


def _bill(
    db: Session,
    name: str,
    amount: float,
    due: date | None,
    account_id: int | None,
    frequency: str = "monthly",
    autopay: bool = False,
) -> None:
    db.add(
        RecurringExpense(
            name=name,
            category="Utilities",
            amount=amount,
            frequency=frequency,
            next_due_date=due,
            paid_from_account_id=account_id,
            autopay=autopay,
        )
    )
    db.commit()


def _pay(db: Session, amount: float, account_id: int, **schedule: object) -> None:
    db.add(
        IncomeSource(
            name="Paycheck",
            category="Salary",
            amount=amount,
            deposited_to_account_id=account_id,
            **schedule,
        )
    )
    db.commit()


def test_projects_bills_and_paydays_through_the_window(db_session: Session) -> None:
    checking = _account(db_session, "Checking", "checking", 1000)
    card = _account(db_session, "Card", "credit_card", 300)
    savings = _account(db_session, "Savings", "savings", 5000)
    _bill(db_session, "Water", 50, date(2026, 11, 2), checking)  # overdue, manual
    _bill(db_session, "Electric", 100, date(2026, 11, 1), checking, autopay=True)
    _bill(db_session, "Rent", 1500, date(2026, 11, 15), checking)
    _bill(db_session, "Streaming", 15, date(2026, 11, 12), card)
    _bill(db_session, "Gym", 40, date(2026, 11, 10), None)
    _bill(db_session, "Someday", 99, None, checking)
    # Nov 22 is a Sunday, so it's paid Friday Nov 20.
    _pay(db_session, 2000, checking, frequency="semimonthly", pay_day_1=6, pay_day_2=22)
    _pay(db_session, 20, savings, frequency="monthly", pay_date=date(2026, 11, 15))

    f = AccountForecastService.get_forecast(db_session, 14, today=TODAY)

    assert (f.start, f.end) == (TODAY, date(2026, 11, 23))
    # Savings only has income, so there is nothing to check.
    assert [a.label for a in f.accounts] == ["Checking"]
    a = f.accounts[0]
    assert [(e.date, e.name, e.balance_after, e.overdue) for e in a.events] == [
        (TODAY, "Water", 950, True),
        (date(2026, 11, 15), "Rent", -550, False),
        (date(2026, 11, 20), "Paycheck", 1450, False),
    ]
    # Electric was on autopay; it next comes out Dec 1, after the window.
    assert (a.bills_total, a.income_total, a.ending_balance) == (1550, 2000, 1450)
    assert (a.lowest_balance, a.lowest_date) == (-550, date(2026, 11, 15))
    assert (a.short_date, a.short_bill) == (date(2026, 11, 15), "Rent")
    assert (a.name, a.institution, a.has_paydays) == ("Checking", None, True)

    assert [(c.label, c.total, c.count) for c in f.cards] == [("Card", 15, 1)]
    assert (f.unlinked_total, f.unlinked_count, f.undated_count) == (40, 1, 1)


def test_payday_on_the_same_day_as_a_bill_comes_first(db_session: Session) -> None:
    checking = _account(db_session, "Checking", "checking", 0)
    _bill(db_session, "Rent", 100, date(2026, 11, 20), checking)
    _pay(db_session, 500, checking, frequency="biweekly", pay_date=date(2026, 11, 20))

    a = AccountForecastService.get_forecast(db_session, 14, today=TODAY).accounts[0]
    assert a.short_date is None
    assert (a.lowest_balance, a.lowest_date) == (0, TODAY)


def test_repeating_and_missed_bills_count_every_payment(db_session: Session) -> None:
    checking = _account(db_session, "Checking", "checking", 10_000)
    _bill(db_session, "Lawn", 10, TODAY, checking, frequency="weekly")
    # Two missed months are still owed today, plus the one due Nov 20.
    _bill(db_session, "Loan", 100, date(2026, 9, 20), checking)

    a = AccountForecastService.get_forecast(db_session, 14, today=TODAY).accounts[0]
    assert [(e.date, e.name, e.overdue) for e in a.events] == [
        (TODAY, "Lawn", False),
        (TODAY, "Loan", True),
        (TODAY, "Loan", True),
        (date(2026, 11, 16), "Lawn", False),
        (date(2026, 11, 20), "Loan", False),
        (date(2026, 11, 23), "Lawn", False),
    ]
    assert a.bills_total == 330


def test_short_accounts_are_listed_first(db_session: Session) -> None:
    a1 = _account(db_session, "A fine", "checking", 1000)
    a2 = _account(db_session, "B short", "checking", 10)
    _bill(db_session, "x", 50, date(2026, 11, 12), a1)
    _bill(db_session, "y", 50, date(2026, 11, 12), a2)

    f = AccountForecastService.get_forecast(db_session, 7, today=TODAY)
    assert [a.label for a in f.accounts] == ["B short", "A fine"]


def test_has_paydays_needs_a_schedule(db_session: Session) -> None:
    checking = _account(db_session, "Checking", "checking", 1000)
    _bill(db_session, "Rent", 100, date(2026, 11, 12), checking)
    _pay(db_session, 2000, checking, frequency="biweekly")  # no pay date set

    a = AccountForecastService.get_forecast(db_session, 7, today=TODAY).accounts[0]
    assert a.has_paydays is False
