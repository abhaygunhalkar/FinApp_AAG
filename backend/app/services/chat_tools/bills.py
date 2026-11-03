"""getUpcomingBills: fixed costs due in the next N days."""

from datetime import timedelta
from decimal import Decimal

from app.repositories.recurring_expense_repository import RecurringExpenseRepository
from app.schemas.chat_tools import (
    GetUpcomingBillsInput,
    GetUpcomingBillsResult,
    UpcomingBill,
)
from app.services import account_link
from app.services.account_forecast_service import bill_dates
from app.services.chat_tools.registry import Tool, ToolContext, money


def get_upcoming_bills(
    ctx: ToolContext, data: GetUpcomingBillsInput
) -> GetUpcomingBillsResult:
    # Read-only: bill_dates works out autopay roll-forward without saving it,
    # unlike RecurringExpenseService.get_all.
    start = ctx.today
    end = start + timedelta(days=data.within_days)
    expenses = RecurringExpenseRepository.get_all(ctx.db)
    labels = account_link.account_labels(ctx.db)
    bills = [
        UpcomingBill(
            bill_id=e.id,
            name=e.name,
            category=e.category,
            amount=money(e.amount),
            due_date=due,
            overdue=overdue,
            autopay=e.autopay,
            paid_from=account_link.display_label(
                ctx.db, e.paid_from_account_id, e.paid_from, labels
            ),
        )
        for e in expenses
        for due, overdue in bill_dates(e, start, end)
    ]
    bills.sort(key=lambda b: (b.due_date, b.name))
    return GetUpcomingBillsResult(
        start=start,
        end=end,
        bills=bills,
        total=sum((b.amount for b in bills), Decimal("0.00")),
        without_due_date=sum(1 for e in expenses if e.next_due_date is None),
    )


GET_UPCOMING_BILLS: Tool[GetUpcomingBillsInput, GetUpcomingBillsResult] = Tool(
    name="getUpcomingBills",
    description=(
        "The owner's fixed costs (bills) due from today through the next "
        "withinDays days (default 30, max 60), soonest first. A bill that repeats "
        "in the window appears once per due date. Overdue manual bills are listed "
        "as due today with overdue=true. Amounts are USD strings with two decimals."
    ),
    input_model=GetUpcomingBillsInput,
    output_model=GetUpcomingBillsResult,
    handler=get_upcoming_bills,
)
