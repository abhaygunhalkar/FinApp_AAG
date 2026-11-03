"""getCashFlowForecast and getIncome: will the money cover the bills."""

from decimal import Decimal

from app.schemas.chat_tools import (
    AccountProjection,
    GetCashFlowForecastInput,
    GetCashFlowForecastResult,
    GetIncomeResult,
    IncomeItem,
    NoInput,
)
from app.services.account_forecast_service import AccountForecastService
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.income_service import IncomeService


def get_cash_flow_forecast(
    ctx: ToolContext, data: GetCashFlowForecastInput
) -> GetCashFlowForecastResult:
    forecast = AccountForecastService.get_forecast(ctx.db, data.within_days, ctx.today)
    return GetCashFlowForecastResult(
        start=forecast.start,
        end=forecast.end,
        accounts=[
            AccountProjection(
                account_id=a.account_id,
                name=a.label,
                balance=money(a.balance),
                bills=money(a.bills_total),
                income=money(a.income_total),
                ending_balance=money(a.ending_balance),
                lowest_balance=money(a.lowest_balance),
                lowest_date=a.lowest_date,
                short_date=a.short_date,
                short_bill=a.short_bill,
            )
            for a in forecast.accounts
        ],
        card_charges=sum((money(c.total) for c in forecast.cards), Decimal("0.00")),
        unlinked=money(forecast.unlinked_total),
        unlinked_count=forecast.unlinked_count,
    )


GET_CASH_FLOW_FORECAST: Tool[GetCashFlowForecastInput, GetCashFlowForecastResult] = (
    Tool(
        name="getCashFlowForecast",
        description=(
            "Projects each checking and savings account's balance through the "
            "bills it pays and the paychecks it receives over the next withinDays "
            "days (default 14, max 90): ending and lowest balance, and the first "
            "day and bill that would take it below zero (shortDate, shortBill). "
            "Bills charged to credit cards are totalled separately. Amounts are "
            "USD strings with two decimals."
        ),
        input_model=GetCashFlowForecastInput,
        output_model=GetCashFlowForecastResult,
        handler=get_cash_flow_forecast,
    )
)


def get_income(ctx: ToolContext, _data: NoInput) -> GetIncomeResult:
    sources = IncomeService.get_all(ctx.db, ctx.today)
    summary = IncomeService.get_cash_flow_summary(ctx.db)
    return GetIncomeResult(
        sources=[
            IncomeItem(
                id=s.id,
                name=s.name,
                category=s.category,
                amount=money(s.amount),
                frequency=s.frequency,
                monthly_amount=money(s.monthly_amount),
                next_pay_date=s.next_pay_date,
                deposited_to=s.deposited_to,
            )
            for s in sorted(
                sources, key=lambda s: (s.next_pay_date is None, s.next_pay_date)
            )
        ],
        monthly_income=money(summary.monthly_income),
        monthly_fixed_costs=money(summary.monthly_fixed_costs),
        monthly_left_over=money(summary.monthly_surplus),
        kept_pct=summary.kept_pct,
        liquid_cash=money(summary.liquid_cash),
        emergency_months=summary.emergency_months,
    )


GET_INCOME: Tool[NoInput, GetIncomeResult] = Tool(
    name="getIncome",
    description=(
        "The owner's income sources (soonest next pay date first) and the monthly "
        "picture: income, fixed costs, what's left over, the share kept, cash in "
        "checking and savings, and how many months of fixed costs that cash "
        "covers. Amounts are USD strings with two decimals."
    ),
    input_model=NoInput,
    output_model=GetIncomeResult,
    handler=get_income,
)
