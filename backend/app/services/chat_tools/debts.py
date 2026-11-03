"""getDebts: credit cards and loans from the Net Worth accounts."""

from decimal import Decimal

from app.schemas.chat_tools import CardDebt, GetDebtsResult, LoanDebt, NoInput
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.financial_account_service import FinancialAccountService


def _pct(part: float, whole: float | None) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def get_debts(ctx: ToolContext, _data: NoInput) -> GetDebtsResult:
    accounts = FinancialAccountService.get_all(ctx.db)
    cards = [
        CardDebt(
            id=a.id,
            name=FinancialAccountService.label_of(a.name, a.institution),
            balance=money(a.balance),
            credit_limit=money(a.credit_limit) if a.credit_limit else None,
            utilization_pct=_pct(a.balance, a.credit_limit),
            apr=a.apr,
            due_date=a.due_date,
        )
        for a in accounts
        if a.account_type == "credit_card"
    ]
    loans = [
        LoanDebt(
            id=a.id,
            name=FinancialAccountService.label_of(a.name, a.institution),
            type=a.account_type,
            balance=money(a.balance),
            original_amount=money(a.original_amount) if a.original_amount else None,
            paid_off_pct=(
                round(max(0.0, 100 - a.balance / a.original_amount * 100), 1)
                if a.original_amount
                else None
            ),
            apr=a.apr,
            payoff_date=a.payoff_date,
        )
        for a in accounts
        if a.account_type in ("loan", "mortgage")
    ]
    cards.sort(key=lambda c: c.balance, reverse=True)
    loans.sort(key=lambda loan: loan.balance, reverse=True)
    zero = Decimal("0.00")
    card_balance = sum((c.balance for c in cards), zero)
    limited = [c for c in cards if c.credit_limit]
    card_limit = sum((c.credit_limit or zero for c in limited), zero)
    limited_balance = sum((c.balance for c in limited), zero)
    loan_balance = sum((loan.balance for loan in loans), zero)
    return GetDebtsResult(
        cards=cards,
        loans=loans,
        card_balance=card_balance,
        card_limit=card_limit,
        utilization_pct=(
            round(float(limited_balance / card_limit * 100), 1) if card_limit else None
        ),
        loan_balance=loan_balance,
        total=card_balance + loan_balance,
    )


GET_DEBTS: Tool[NoInput, GetDebtsResult] = Tool(
    name="getDebts",
    description=(
        "The owner's credit cards (balance, limit, utilization %, APR, due date) "
        "and loans and mortgages (balance, original amount, % paid off, APR, "
        "payoff date), largest balance first, with totals. Overall utilization "
        "counts only cards with a limit set. Amounts are USD strings with two "
        "decimals; balances are amounts owed."
    ),
    input_model=NoInput,
    output_model=GetDebtsResult,
    handler=get_debts,
)
