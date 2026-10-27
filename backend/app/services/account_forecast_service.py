"""Will each bank account cover the bills due before the next paychecks?"""

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.recurring_expense import RecurringExpense
from app.repositories.financial_account_repository import FinancialAccountRepository
from app.repositories.income_repository import IncomeRepository
from app.repositories.recurring_expense_repository import RecurringExpenseRepository
from app.schemas.account_forecast import (
    AccountForecast,
    AccountForecastResponse,
    CardCharges,
    ForecastEvent,
)
from app.services import pay_schedule
from app.services.financial_account_service import FinancialAccountService
from app.services.recurring_expense_service import add_periods, roll_forward

BANK_TYPES = {"checking", "savings"}


def bill_dates(
    expense: RecurringExpense, today: date, end: date
) -> list[tuple[date, bool]]:
    """Due dates from today through end, each with whether it is overdue.

    An overdue autopay bill was already paid, so counting starts from its next
    occurrence. Every missed payment of a manual bill is still owed, so each
    one counts as due today.
    """
    due = expense.next_due_date
    if due is None:
        return []
    if expense.autopay and due < today:
        due = roll_forward(due, expense.frequency, today)
    out = []
    count = 0
    while (d := add_periods(due, expense.frequency, count)) <= end:
        out.append((max(d, today), d < today))
        count += 1
    return out


class AccountForecastService:
    """Projects bank balances day by day through bills and paydays."""

    @staticmethod
    def get_forecast(
        db: Session, days: int, today: date | None = None
    ) -> AccountForecastResponse:
        today = today or date.today()
        end = today + timedelta(days=days)
        accounts = {a.id: a for a in FinancialAccountRepository.get_all(db)}

        # (date, order, kind, name, amount, overdue); income sorts first on a
        # shared day, since paychecks usually post before bills are drawn.
        events: dict[int, list[tuple[date, int, str, str, float, bool]]]
        events = defaultdict(list)
        cards: dict[int, list[float]] = defaultdict(list)
        unlinked: list[float] = []
        undated = 0

        for e in RecurringExpenseRepository.get_all(db):
            if e.next_due_date is None:
                undated += 1
                continue
            account = accounts.get(e.paid_from_account_id or -1)
            for d, overdue in bill_dates(e, today, end):
                if account is None:
                    unlinked.append(e.amount)
                elif account.account_type == "credit_card":
                    cards[account.id].append(e.amount)
                elif account.account_type in BANK_TYPES:
                    events[account.id].append(
                        (d, 1, "bill", e.name, -e.amount, overdue)
                    )

        paid_into: set[int] = set()
        for i in IncomeRepository.get_all(db):
            account = accounts.get(i.deposited_to_account_id or -1)
            if account is None or account.account_type not in BANK_TYPES:
                continue
            if pay_schedule.has_schedule(i):
                paid_into.add(account.id)
            for d in pay_schedule.pay_dates(i, today, end):
                events[account.id].append((d, 0, "income", i.name, i.amount, False))

        forecasts = [
            AccountForecastService._project(
                accounts[aid], sorted(evts), today, aid in paid_into
            )
            for aid, evts in events.items()
            if any(kind == "bill" for _, _, kind, *_ in evts)
        ]
        forecasts.sort(key=lambda f: (f.short_date is None, f.label))

        return AccountForecastResponse(
            start=today,
            end=end,
            accounts=forecasts,
            cards=sorted(
                (
                    CardCharges(
                        account_id=aid,
                        label=FinancialAccountService.label(accounts[aid]),
                        name=accounts[aid].name,
                        institution=accounts[aid].institution,
                        total=round(sum(amounts), 2),
                        count=len(amounts),
                    )
                    for aid, amounts in cards.items()
                ),
                key=lambda c: c.label,
            ),
            unlinked_total=round(sum(unlinked), 2),
            unlinked_count=len(unlinked),
            undated_count=undated,
        )

    @staticmethod
    def _project(
        account: FinancialAccount,
        evts: list[tuple[date, int, str, str, float, bool]],
        today: date,
        has_paydays: bool,
    ) -> AccountForecast:
        balance = round(account.balance, 2)
        lowest, lowest_date = balance, today
        short_date: date | None = None
        short_bill: str | None = None
        timeline = []
        for d, _, kind, name, amount, overdue in evts:
            balance = round(balance + amount, 2)
            timeline.append(
                ForecastEvent(
                    date=d,
                    kind="bill" if kind == "bill" else "income",
                    name=name,
                    amount=amount,
                    balance_after=balance,
                    overdue=overdue,
                )
            )
            if balance < lowest:
                lowest, lowest_date = balance, d
            if balance < 0 and short_date is None:
                short_date, short_bill = d, name
        return AccountForecast(
            account_id=account.id,
            label=FinancialAccountService.label(account),
            name=account.name,
            institution=account.institution,
            account_type=account.account_type,
            has_paydays=has_paydays,
            balance=round(account.balance, 2),
            bills_total=round(-sum(a for _, _, k, _, a, _ in evts if k == "bill"), 2),
            income_total=round(sum(a for _, _, k, _, a, _ in evts if k == "income"), 2),
            ending_balance=balance,
            lowest_balance=lowest,
            lowest_date=lowest_date,
            short_date=short_date,
            short_bill=short_bill,
            events=timeline,
        )
