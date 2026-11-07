"""getPortfolio: the stock and ETF portfolio at a glance, optionally just
stocks or just ETFs."""

from collections import defaultdict
from decimal import Decimal

from app.schemas.chat_tools import (
    BrokerValue,
    GetPortfolioInput,
    GetPortfolioResult,
    Mover,
)
from app.schemas.holding import HoldingResponse
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.dashboard_service import DashboardService
from app.services.holdings_service import HoldingsService

MOVERS = 3


def _mover(h: HoldingResponse) -> Mover:
    return Mover(
        ticker=h.ticker,
        name=h.company_name,
        day_change=money(h.daily_change),
        day_change_pct=h.daily_change_pct,
        value=money(h.current_value),
    )


def _pct(part: Decimal, whole: Decimal) -> float | None:
    return round(float(part / whole * 100), 1) if whole else None


def get_portfolio(ctx: ToolContext, data: GetPortfolioInput) -> GetPortfolioResult:
    summary = DashboardService.get_summary(ctx.db)
    holdings = HoldingsService.get_all_holdings(
        ctx.db, None if data.type == "all" else data.type
    )
    by_change = sorted(holdings, key=lambda h: h.daily_change)
    gainers = [_mover(h) for h in reversed(by_change) if h.daily_change > 0]
    losers = [_mover(h) for h in by_change if h.daily_change < 0]
    zero = Decimal("0.00")

    if data.type == "all":
        # The same totals as the dashboard.
        value = money(summary.total_portfolio_value)
        invested = money(summary.total_invested)
        gain = money(summary.unrealized_gain)
        brokers = [
            BrokerValue(
                broker=b.broker,
                value=money(b.market_value),
                gain=money(b.unrealized_gain),
                holdings=b.holding_count,
            )
            for b in DashboardService.get_broker_summary(ctx.db)
        ]
        return GetPortfolioResult(
            type="all",
            value=value,
            invested=invested,
            unrealized_gain=gain,
            unrealized_gain_pct=_pct(gain, invested),
            day_change=money(summary.daily_change),
            realized_gain=money(summary.realized_gain),
            annual_dividends=money(summary.annual_dividend_income),
            holdings=summary.number_of_holdings,
            brokers=brokers,
            gainers=gainers[:MOVERS],
            losers=losers[:MOVERS],
            stale=summary.stale_data,
        )

    # Just stocks or just ETFs: totalled from those holdings.
    per_broker: dict[str, list[HoldingResponse]] = defaultdict(list)
    for h in holdings:
        per_broker[h.broker or "No broker"].append(h)
    value = sum((money(h.current_value) for h in holdings), zero)
    invested = sum((money(h.total_invested) for h in holdings), zero)
    gain = sum((money(h.unrealized_gain) for h in holdings), zero)
    return GetPortfolioResult(
        type=data.type,
        value=value,
        invested=invested,
        unrealized_gain=gain,
        unrealized_gain_pct=_pct(gain, invested),
        day_change=sum((money(h.daily_change) for h in holdings), zero),
        realized_gain=None,
        annual_dividends=sum((money(h.annual_dividend_income) for h in holdings), zero),
        holdings=len(holdings),
        brokers=sorted(
            (
                BrokerValue(
                    broker=name,
                    value=sum((money(h.current_value) for h in hs), zero),
                    gain=sum((money(h.unrealized_gain) for h in hs), zero),
                    holdings=len(hs),
                )
                for name, hs in per_broker.items()
            ),
            key=lambda b: b.value,
            reverse=True,
        ),
        gainers=gainers[:MOVERS],
        losers=losers[:MOVERS],
        stale=summary.stale_data,
    )


GET_PORTFOLIO: Tool[GetPortfolioInput, GetPortfolioResult] = Tool(
    name="getPortfolio",
    description=(
        "The owner's investments: market value, amount invested, unrealized gain "
        "(and %), today's change, annual dividend income, value and gain by "
        "broker, and today's three biggest gainers and losers in dollars. type "
        "narrows to stocks or ETFs (default all); realized gain to date is only "
        "given for all. stale=true means prices may be out of date. Amounts are "
        "USD strings with two decimals."
    ),
    input_model=GetPortfolioInput,
    output_model=GetPortfolioResult,
    handler=get_portfolio,
)
