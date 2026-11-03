"""getPortfolio: the stock and ETF portfolio at a glance."""

from app.schemas.chat_tools import BrokerValue, GetPortfolioResult, Mover, NoInput
from app.schemas.holding import HoldingResponse
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.dashboard_service import DashboardService
from app.services.holdings_service import HoldingsService

MOVERS = 3


def get_portfolio(ctx: ToolContext, _data: NoInput) -> GetPortfolioResult:
    summary = DashboardService.get_summary(ctx.db)
    holdings = HoldingsService.get_all_holdings(ctx.db)

    def mover(h: HoldingResponse) -> Mover:
        return Mover(
            ticker=h.ticker,
            name=h.company_name,
            day_change=money(h.daily_change),
            day_change_pct=h.daily_change_pct,
            value=money(h.current_value),
        )

    by_change = sorted(holdings, key=lambda h: h.daily_change)
    return GetPortfolioResult(
        value=money(summary.total_portfolio_value),
        invested=money(summary.total_invested),
        unrealized_gain=money(summary.unrealized_gain),
        unrealized_gain_pct=(
            round(summary.unrealized_gain / summary.total_invested * 100, 1)
            if summary.total_invested
            else None
        ),
        day_change=money(summary.daily_change),
        realized_gain=money(summary.realized_gain),
        annual_dividends=money(summary.annual_dividend_income),
        holdings=summary.number_of_holdings,
        brokers=[
            BrokerValue(
                broker=b.broker,
                value=money(b.market_value),
                gain=money(b.unrealized_gain),
                holdings=b.holding_count,
            )
            for b in DashboardService.get_broker_summary(ctx.db)
        ],
        gainers=[mover(h) for h in reversed(by_change) if h.daily_change > 0][:MOVERS],
        losers=[mover(h) for h in by_change if h.daily_change < 0][:MOVERS],
        stale=summary.stale_data,
    )


GET_PORTFOLIO: Tool[NoInput, GetPortfolioResult] = Tool(
    name="getPortfolio",
    description=(
        "The owner's stock and ETF portfolio: market value, amount invested, "
        "unrealized gain (and %), today's change, realized gain to date, annual "
        "dividend income, value and gain by broker, and today's three biggest "
        "gainers and losers in dollars. stale=true means prices may be out of "
        "date. Amounts are USD strings with two decimals."
    ),
    input_model=NoInput,
    output_model=GetPortfolioResult,
    handler=get_portfolio,
)
