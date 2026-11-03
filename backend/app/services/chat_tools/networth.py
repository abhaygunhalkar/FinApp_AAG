"""getNetWorthTrend: how net worth has moved over a range."""

from datetime import timedelta

from app.schemas.chat_tools import (
    GetNetWorthTrendInput,
    GetNetWorthTrendResult,
    TrendPoint,
)
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.financial_account_service import FinancialAccountService

RANGE_DAYS = {"1W": 7, "1M": 30, "3M": 91, "1Y": 365, "ALL": None}
MAX_POINTS = 40  # enough for a small chart; the ends are always kept


def _thin(points: list[TrendPoint]) -> list[TrendPoint]:
    if len(points) <= MAX_POINTS:
        return points
    step = (len(points) - 1) / (MAX_POINTS - 1)
    return [points[round(i * step)] for i in range(MAX_POINTS)]


def get_net_worth_trend(
    ctx: ToolContext, data: GetNetWorthTrendInput
) -> GetNetWorthTrendResult:
    # Daily snapshots, as on the Net Worth page; today is the live figure so
    # the trend ends at the same number the page shows.
    days = RANGE_DAYS[data.range]
    since = ctx.today - timedelta(days=days) if days is not None else None
    points = [
        TrendPoint(date=s.date, value=money(s.net_worth))
        for s in FinancialAccountService.get_snapshots(ctx.db)
        if s.date < ctx.today and (since is None or s.date >= since)
    ]
    live = FinancialAccountService.get_summary(ctx.db).net_worth
    points.append(TrendPoint(date=ctx.today, value=money(live)))

    if len(points) < 2:
        return GetNetWorthTrendResult(
            range=data.range,
            points=points,
            change=None,
            change_pct=None,
            high=None,
            low=None,
        )
    first, last = points[0].value, points[-1].value
    change = last - first
    return GetNetWorthTrendResult(
        range=data.range,
        points=_thin(points),
        change=change,
        change_pct=round(float(change / abs(first) * 100), 1) if first else None,
        high=max(p.value for p in points),
        low=min(p.value for p in points),
    )


GET_NET_WORTH_TREND: Tool[GetNetWorthTrendInput, GetNetWorthTrendResult] = Tool(
    name="getNetWorthTrend",
    description=(
        "How the owner's net worth changed over a range (1W, 1M, 3M, 1Y or ALL; "
        "default 1M): daily points ending with today's live value (at most 40, "
        "evenly thinned), the change and % change from the first point, and the "
        "high and low. Fewer than two points means not enough history yet. "
        "Amounts are USD strings with two decimals."
    ),
    input_model=GetNetWorthTrendInput,
    output_model=GetNetWorthTrendResult,
    handler=get_net_worth_trend,
)
