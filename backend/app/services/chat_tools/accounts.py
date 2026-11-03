"""getBalance: Net Worth account balances and totals."""

from decimal import Decimal

from app.schemas.chat_tools import (
    AccountBalance,
    BalanceTotals,
    GetBalanceInput,
    GetBalanceResult,
)
from app.services.chat_tools.registry import Tool, ToolContext, ToolError, money
from app.services.financial_account_service import FinancialAccountService


def get_balance(ctx: ToolContext, data: GetBalanceInput) -> GetBalanceResult:
    accounts = [
        AccountBalance(
            id=a.id,
            name=a.name,
            institution=a.institution,
            type=a.account_type,
            is_asset=a.is_asset,
            balance=money(a.balance),
            last_updated=a.last_synced,
        )
        for a in FinancialAccountService.get_all(ctx.db)
    ]
    if data.account_id is not None:
        match = [a for a in accounts if a.id == data.account_id]
        if not match:
            raise ToolError(f"No account with id {data.account_id}")
        return GetBalanceResult(accounts=match)

    # Totals are summed from the rounded balances above so they always add up;
    # only the portfolio value comes from the Net Worth summary.
    portfolio = money(FinancialAccountService.get_summary(ctx.db).portfolio_value)
    assets = sum((a.balance for a in accounts if a.is_asset), portfolio)
    liabilities = sum((a.balance for a in accounts if not a.is_asset), Decimal("0.00"))
    return GetBalanceResult(
        accounts=accounts,
        totals=BalanceTotals(
            assets=assets,
            liabilities=liabilities,
            net_worth=assets - liabilities,
            portfolio=portfolio,
        ),
    )


GET_BALANCE: Tool[GetBalanceInput, GetBalanceResult] = Tool(
    name="getBalance",
    description=(
        "Balances of the owner's Net Worth accounts (bank, card, loan, property, "
        "...). Without accountId, every account plus net worth totals, where "
        "assets include the stock/ETF portfolio. Liabilities are positive "
        "amounts owed. Amounts are USD strings with two decimals."
    ),
    input_model=GetBalanceInput,
    output_model=GetBalanceResult,
    handler=get_balance,
)
