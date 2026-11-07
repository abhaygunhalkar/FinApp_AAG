"""getOptions: options trades: P&L, win rate, and what's open."""

from decimal import Decimal

from app.schemas.chat_tools import GetOptionsResult, NoInput, OptionPosition
from app.services.chat_tools.registry import Tool, ToolContext, money
from app.services.options_service import OptionsService


def get_options(ctx: ToolContext, _data: NoInput) -> GetOptionsResult:
    # Read-only and offline: open positions' live quotes aren't fetched.
    summary = OptionsService.get_summary(ctx.db)
    trades = OptionsService.list_trades(ctx.db)
    closed = [t for t in trades if t.pnl is not None]
    open_trades = sorted(
        (t for t in trades if t.status == "open"),
        key=lambda t: (t.expiry_date, t.ticker),
    )
    return GetOptionsResult(
        realized_pnl=money(summary.total_pnl),
        win_rate=summary.win_rate if closed else None,
        open_positions=summary.open_positions,
        expiring_this_week=summary.expiring_this_week,
        open=[
            OptionPosition(
                id=t.id,
                ticker=t.ticker,
                trade_type=t.trade_type,
                strike=money(t.strike_price),
                expiry_date=t.expiry_date,
                contracts=t.contracts,
                premium=money(t.premium * t.contracts * 100)
                * (Decimal(1) if t.trade_type.startswith("sell_") else Decimal(-1)),
                broker=t.broker,
            )
            for t in open_trades
        ],
        trades=len(trades),
    )


GET_OPTIONS: Tool[NoInput, GetOptionsResult] = Tool(
    name="getOptions",
    description=(
        "The owner's options trades: realized P&L of closed, expired and assigned "
        "trades, win rate on those, how many positions are open and how many "
        "expire this week, and each open position (ticker, type, strike, expiry, "
        "contracts, premium: positive when received for sells, negative when "
        "paid for buys), soonest expiry first. Amounts are USD strings with two "
        "decimals."
    ),
    input_model=NoInput,
    output_model=GetOptionsResult,
    handler=get_options,
)
