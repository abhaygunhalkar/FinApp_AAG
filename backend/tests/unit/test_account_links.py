"""Linking fixed costs and income to Net Worth accounts."""

import pytest
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.schemas.income import IncomeSourceCreate, IncomeSourceUpdate
from app.schemas.recurring_expense import RecurringExpenseCreate, RecurringExpenseUpdate
from app.services.financial_account_service import FinancialAccountService
from app.services.income_service import IncomeService
from app.services.recurring_expense_service import RecurringExpenseService


def _account(
    db: Session, name: str, account_type: str, institution: str | None = None
) -> FinancialAccount:
    account = FinancialAccount(
        name=name, institution=institution, account_type=account_type, balance=100.0
    )
    db.add(account)
    db.commit()
    return account


def _bill(db: Session, **link: object) -> int:
    data = {"name": "Gym", "category": "Health & fitness", "amount": 45.0, **link}
    return RecurringExpenseService.create(db, RecurringExpenseCreate(**data)).id


def test_linked_bill_shows_the_accounts_current_name(db_session: Session) -> None:
    card = _account(db_session, "Rewards Card", "credit_card", "Harbor Bank")
    bill_id = _bill(db_session, paid_from_account_id=card.id, paid_from="ignored text")

    (bill,) = RecurringExpenseService.get_all(db_session)
    assert bill.id == bill_id
    assert bill.paid_from_account_id == card.id
    assert bill.paid_from == "Rewards Card (Harbor Bank)"

    card.name = "Travel Card"
    db_session.commit()
    (bill,) = RecurringExpenseService.get_all(db_session)
    assert bill.paid_from == "Travel Card (Harbor Bank)"


def test_unlinked_bill_keeps_free_text(db_session: Session) -> None:
    _bill(db_session, paid_from="  Chase chk ")
    (bill,) = RecurringExpenseService.get_all(db_session)
    assert bill.paid_from_account_id is None
    assert bill.paid_from == "Chase chk"


@pytest.mark.parametrize("account_type", ["mortgage", "loan", "investment"])
def test_bill_rejects_accounts_that_cant_pay(
    db_session: Session, account_type: str
) -> None:
    account = _account(db_session, "Not a payer", account_type)
    with pytest.raises(ValueError, match="can't be used here"):
        _bill(db_session, paid_from_account_id=account.id)


def test_bill_rejects_missing_account(db_session: Session) -> None:
    with pytest.raises(ValueError, match="not found"):
        _bill(db_session, paid_from_account_id=999)


def test_bill_update_link_unlink_and_text(db_session: Session) -> None:
    checking = _account(db_session, "Everyday Checking", "checking")
    bill_id = _bill(db_session, paid_from="old text")

    linked = RecurringExpenseService.update(
        db_session, bill_id, RecurringExpenseUpdate(paid_from_account_id=checking.id)
    )
    assert (linked.paid_from_account_id, linked.paid_from) == (
        checking.id,
        "Everyday Checking",
    )

    # Changing something else leaves the link alone.
    renamed = RecurringExpenseService.update(
        db_session, bill_id, RecurringExpenseUpdate(name="Gym (family)")
    )
    assert renamed.paid_from_account_id == checking.id

    unlinked = RecurringExpenseService.update(
        db_session,
        bill_id,
        RecurringExpenseUpdate(paid_from_account_id=None, paid_from="Cash"),
    )
    assert (unlinked.paid_from_account_id, unlinked.paid_from) == (None, "Cash")


def test_deleting_an_account_keeps_its_name_on_bills_and_income(
    db_session: Session,
) -> None:
    checking = _account(db_session, "Everyday Checking", "checking", "Harbor Bank")
    _bill(db_session, paid_from_account_id=checking.id)
    IncomeService.create(
        db_session,
        IncomeSourceCreate(
            name="Paycheck",
            category="Salary",
            amount=3000.0,
            deposited_to_account_id=checking.id,
        ),
    )

    FinancialAccountService.delete(db_session, checking.id)

    (bill,) = RecurringExpenseService.get_all(db_session)
    (income,) = IncomeService.get_all(db_session)
    assert (bill.paid_from_account_id, bill.paid_from) == (
        None,
        "Everyday Checking (Harbor Bank)",
    )
    assert (income.deposited_to_account_id, income.deposited_to) == (
        None,
        "Everyday Checking (Harbor Bank)",
    )


def test_income_links_only_to_bank_accounts(db_session: Session) -> None:
    savings = _account(db_session, "High-Yield Savings", "savings", "Summit Savings")
    card = _account(db_session, "Rewards Card", "credit_card")

    income = IncomeService.create(
        db_session,
        IncomeSourceCreate(
            name="Interest",
            category="Dividends & interest",
            amount=50.0,
            deposited_to_account_id=savings.id,
        ),
    )
    assert income.deposited_to == "High-Yield Savings (Summit Savings)"

    with pytest.raises(ValueError, match="can't be used here"):
        IncomeService.update(
            db_session, income.id, IncomeSourceUpdate(deposited_to_account_id=card.id)
        )
