"""getUpcomingBills, getBills and markBillPaid: fixed costs (bills)."""

from datetime import timedelta
from decimal import Decimal

from app.repositories.recurring_expense_repository import RecurringExpenseRepository
from app.schemas.chat_tools import (
    BillItem,
    GetBillsResult,
    GetUpcomingBillsInput,
    GetUpcomingBillsResult,
    MarkBillPaidInput,
    MarkBillPaidResult,
    NoInput,
    UpcomingBill,
)
from app.services import account_link
from app.services.account_forecast_service import bill_dates
from app.services.chat_tools.registry import Tool, ToolContext, ToolError, money
from app.services.recurring_expense_service import RecurringExpenseService, roll_forward


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


def get_bills(ctx: ToolContext, _data: NoInput) -> GetBillsResult:
    # Read-only, like getUpcomingBills: autopay roll-forward isn't saved.
    labels = account_link.account_labels(ctx.db)
    bills = []
    for e in RecurringExpenseRepository.get_all(ctx.db):
        due = e.next_due_date
        if due is not None and e.autopay and due < ctx.today:
            due = roll_forward(due, e.frequency, ctx.today)
        bills.append(
            BillItem(
                id=e.id,
                name=e.name,
                category=e.category,
                amount=money(e.amount),
                frequency=e.frequency,
                next_due_date=due,
                overdue=not e.autopay and due is not None and due < ctx.today,
                autopay=e.autopay,
                paid_from=account_link.display_label(
                    ctx.db, e.paid_from_account_id, e.paid_from, labels
                ),
            )
        )
    bills.sort(key=lambda b: (b.next_due_date is None, b.next_due_date, b.name))
    return GetBillsResult(bills=bills)


GET_BILLS: Tool[NoInput, GetBillsResult] = Tool(
    name="getBills",
    description=(
        "All of the owner's fixed costs (bills), soonest due first: amount, "
        "frequency, next due date, whether it's overdue (manual bills past "
        "their date), autopay, and the paying account. Amounts are USD "
        "strings with two decimals."
    ),
    input_model=NoInput,
    output_model=GetBillsResult,
    handler=get_bills,
)


def mark_bill_paid(ctx: ToolContext, data: MarkBillPaidInput) -> MarkBillPaidResult:
    bill = RecurringExpenseRepository.get_by_id(ctx.db, data.bill_id)
    if bill is None:
        raise ToolError(f"No bill with id {data.bill_id}")
    # Same rules as the Fixed Costs page, which only offers this for manual
    # bills: autopay bills move on by themselves.
    if bill.autopay:
        raise ToolError(f"{bill.name} is on autopay, so it moves on by itself")
    if bill.next_due_date is None:
        raise ToolError(f"{bill.name} has no due date to mark paid")
    paid = bill.next_due_date
    updated = RecurringExpenseService.mark_paid(ctx.db, bill.id)
    assert updated.next_due_date is not None
    return MarkBillPaidResult(
        bill_id=bill.id,
        name=bill.name,
        amount=money(bill.amount),
        paid_due_date=paid,
        next_due_date=updated.next_due_date,
    )


MARK_BILL_PAID: Tool[MarkBillPaidInput, MarkBillPaidResult] = Tool(
    name="markBillPaid",
    description=(
        "CHANGES DATA. Marks a manually paid bill's current due date as paid, "
        "moving it to its next due date (as the Fixed Costs page's Mark paid "
        "does). Only after the owner explicitly confirms. Refuses autopay bills "
        "and bills without a due date. Repeating an idempotencyKey returns the "
        "first result without paying again."
    ),
    input_model=MarkBillPaidInput,
    output_model=MarkBillPaidResult,
    handler=mark_bill_paid,
    writes=True,
)
