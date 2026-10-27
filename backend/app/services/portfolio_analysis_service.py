"""Rule-based portfolio analysis service.

31 rules across 6 categories:
  portfolio_health  — concentration, diversification, cash
  risk              — hedging, deep losers, stale data
  income_returns    — dividends, options contribution, performance
  behaviour         — averaging down, long-held losers, idle cash
  options           — expiry, moneyness, coverage
  mistakes          — bad options structure, no stop-loss, inaction
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.options_repository import OptionsRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.portfolio_analysis import PortfolioInsight
from app.services.lot_service import LotService


def _i(rule_id: str, category: str, severity: str, title: str, message: str) -> PortfolioInsight:
    return PortfolioInsight(
        rule_id=rule_id,
        category=category,
        severity=severity,
        title=title,
        message=message,
    )


class PortfolioAnalysisService:

    @staticmethod
    def analyse(db: Session) -> list[PortfolioInsight]:
        holdings = HoldingsRepository.get_all(db)
        all_txns = TransactionRepository.get_all_ordered(db)
        all_options = OptionsRepository.get_all(db)
        cash = CashBalanceRepository.get_balance(db)

        insights: list[PortfolioInsight] = []

        if not holdings:
            return [_i("no_holdings", "portfolio_health", "info",
                       "No holdings yet",
                       "Add your first holding to start receiving portfolio insights.")]

        total_value = sum(h.current_price * h.quantity for h in holdings)
        if total_value == 0:
            return insights

        # Pre-compute allocation per holding
        alloc: dict[int, float] = {
            h.id: (h.current_price * h.quantity / total_value) * 100
            for h in holdings
        }

        # Pre-compute buy transactions grouped by ticker (chronological)
        buy_txns: dict[str, list] = defaultdict(list)
        for t in sorted(all_txns, key=lambda x: x.transaction_date):
            if t.transaction_type == "buy":
                buy_txns[t.ticker].append(t)

        open_options = [o for o in all_options if o.status == "open"]
        open_sell_calls = [o for o in open_options if o.trade_type == "sell_call"]
        open_call_tickers = {o.ticker for o in open_sell_calls}
        open_option_tickers = {o.ticker for o in open_options}

        # Lookup map for holdings by ticker
        holding_by_ticker: dict[str, object] = {h.ticker: h for h in holdings}

        today = date.today()

        # ── PORTFOLIO HEALTH ──────────────────────────────────────────────────

        # Rule 1: Single stock > 20%
        for h in holdings:
            pct = alloc[h.id]
            if pct > 20:
                insights.append(_i(
                    "concentration_single", "portfolio_health", "alert",
                    f"{h.ticker} is over-concentrated",
                    f"{h.ticker} makes up {pct:.1f}% of your portfolio. Anything above 20% creates significant single-stock risk.",
                ))

        # Rule 2: Top 3 holdings > 50%
        top3_pct = sum(sorted(alloc.values(), reverse=True)[:3])
        if len(holdings) > 3 and top3_pct > 50:
            top3 = sorted(holdings, key=lambda h: alloc[h.id], reverse=True)[:3]
            names = ", ".join(h.ticker for h in top3)
            insights.append(_i(
                "concentration_top3", "portfolio_health", "warning",
                "Top 3 holdings dominate the portfolio",
                f"{names} account for {top3_pct:.1f}% of your portfolio. A move in any one of them significantly impacts your total value.",
            ))

        # Rule 3: Sector concentration > 40%
        sector_alloc: dict[str, float] = defaultdict(float)
        for h in holdings:
            sector_alloc[h.sector or "Unknown"] += alloc[h.id]
        for sector, pct in sector_alloc.items():
            if pct > 40:
                insights.append(_i(
                    f"sector_concentration_{sector.lower().replace(' ', '_')}",
                    "portfolio_health", "warning",
                    f"{sector} sector is over-weight",
                    f"{sector} represents {pct:.1f}% of your portfolio. Sector downturns will have an outsized impact.",
                ))

        # Rule 4: Cash drag > 20%
        total_with_cash = total_value + cash.balance
        cash_pct = (cash.balance / total_with_cash * 100) if total_with_cash > 0 else 0
        if cash_pct > 20:
            insights.append(_i(
                "cash_drag", "portfolio_health", "warning",
                "High cash drag",
                f"${cash.balance:,.2f} ({cash_pct:.1f}% of total assets) is sitting in cash. This reduces returns in an up market.",
            ))

        # Rule 5: Majority of holdings underwater
        underwater = [h for h in holdings if h.current_price < h.average_buy_price]
        if len(underwater) > len(holdings) / 2:
            insights.append(_i(
                "majority_underwater", "portfolio_health", "alert",
                f"{len(underwater)} of {len(holdings)} holdings are in the red",
                "More than half your positions are underwater. Review whether these are short-term dips or structural issues.",
            ))

        # ── RISK ─────────────────────────────────────────────────────────────

        # Rule 6 & 7: Options coverage
        unhedged = [h for h in holdings if h.ticker not in open_call_tickers and h.holding_type == "stock"]
        if unhedged:
            coverage_pct = ((len(holdings) - len(unhedged)) / len(holdings)) * 100
            if coverage_pct < 50:
                insights.append(_i(
                    "low_options_coverage", "risk", "info",
                    f"Only {coverage_pct:.0f}% of holdings have covered calls",
                    f"{len(unhedged)} stock(s) have no active covered call: {', '.join(h.ticker for h in unhedged[:5])}{'...' if len(unhedged) > 5 else ''}.",
                ))

        # Rule 8: Holdings > 20% below cost basis
        for h in holdings:
            if h.average_buy_price > 0:
                loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                if loss_pct < -20:
                    insights.append(_i(
                        f"deep_loss_{h.ticker}", "risk", "alert",
                        f"{h.ticker} is down {abs(loss_pct):.1f}%",
                        f"{h.ticker} is ${h.average_buy_price - h.current_price:.2f}/share below your cost basis of ${h.average_buy_price:.2f}. Consider a plan: hold, average down, or cut.",
                    ))

        # Rule 9: Stale price data > 24h
        stale = [h for h in holdings if datetime.now() - h.updated_at > timedelta(hours=24)]
        if stale:
            insights.append(_i(
                "stale_prices", "risk", "warning",
                f"{len(stale)} holding(s) have stale prices",
                f"Price data for {', '.join(h.ticker for h in stale)} hasn't updated in over 24 hours. Trigger a manual refresh.",
            ))

        # ── INCOME & RETURNS ─────────────────────────────────────────────────

        # Rule 10: Top dividend contributor
        div_holders = [h for h in holdings if (h.dividend_yield or 0) > 0]
        if div_holders:
            top_div = max(div_holders, key=lambda h: (h.dividend_yield or 0) * h.current_price * h.quantity)
            top_div_income = min(top_div.dividend_yield or 0, 0.20) * top_div.current_price * top_div.quantity
            total_div = sum(min(h.dividend_yield or 0, 0.20) * h.current_price * h.quantity for h in div_holders)
            if total_div > 0:
                top_pct = (top_div_income / total_div) * 100
                if top_pct > 60:
                    insights.append(_i(
                        "dividend_concentration", "income_returns", "info",
                        f"{top_div.ticker} drives {top_pct:.0f}% of dividend income",
                        f"Your annual dividend income is heavily dependent on {top_div.ticker} (${top_div_income:,.0f}/yr). Diversifying income sources reduces risk.",
                    ))

        # Rule 11: Options P&L vs stock realized gains
        closed_options_pnl = 0.0
        for o in all_options:
            if o.status in ("closed", "expired_worthless"):
                mult = o.contracts * 100
                is_credit = o.trade_type.startswith("sell_")
                if o.status == "closed" and o.close_price is not None:
                    closed_options_pnl += (o.premium - o.close_price) * mult if is_credit else (o.close_price - o.premium) * mult
                elif o.status == "expired_worthless":
                    closed_options_pnl += o.premium * mult if is_credit else -o.premium * mult

        # Cost basis is the average price of the lots each sell took shares from
        cost_basis = LotService.cost_basis_by_sell(db)
        stock_realized = 0.0
        for t in all_txns:
            if t.transaction_type == "sell":
                avg_cost = cost_basis.get(t.id, 0.0)
                stock_realized += (t.price - avg_cost) * t.quantity

        total_realized = stock_realized + closed_options_pnl
        if total_realized != 0 and abs(closed_options_pnl) > 0:
            options_contribution = (closed_options_pnl / total_realized) * 100
            if options_contribution > 40:
                insights.append(_i(
                    "options_pnl_contribution", "income_returns", "info",
                    f"Options trading contributes {options_contribution:.0f}% of realized gains",
                    f"Options P&L: ${closed_options_pnl:,.0f} vs stock realized: ${stock_realized:,.0f}. Your options strategy is a meaningful income driver.",
                ))

        # Rule 12: Best and worst performer
        if len(holdings) >= 2:
            by_pct = sorted(
                [h for h in holdings if h.average_buy_price > 0],
                key=lambda h: (h.current_price - h.average_buy_price) / h.average_buy_price,
            )
            worst = by_pct[0]
            best = by_pct[-1]
            worst_pct = (worst.current_price - worst.average_buy_price) / worst.average_buy_price * 100
            best_pct = (best.current_price - best.average_buy_price) / best.average_buy_price * 100
            insights.append(_i(
                "best_worst_performer", "income_returns", "info",
                f"Best: {best.ticker} ({best_pct:+.1f}%) · Worst: {worst.ticker} ({worst_pct:+.1f}%)",
                f"{best.ticker} is your top performer at {best_pct:+.1f}%. {worst.ticker} is the biggest drag at {worst_pct:+.1f}%.",
            ))

        # ── BEHAVIOUR ────────────────────────────────────────────────────────

        # Rule 13: Averaging down more than twice
        for ticker, buys in buy_txns.items():
            if len(buys) >= 3:
                prices = [b.price for b in buys]
                down_count = sum(1 for i in range(1, len(prices)) if prices[i] < prices[i - 1])
                if down_count >= 2:
                    h = holding_by_ticker.get(ticker)
                    current_loss = ""
                    if h and h.average_buy_price > 0:
                        loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                        current_loss = f" Currently {loss_pct:+.1f}%."
                    insights.append(_i(
                        f"averaging_down_{ticker}", "behaviour", "warning",
                        f"Repeatedly averaging down on {ticker}",
                        f"You've bought {ticker} {len(buys)} times with the price falling between purchases on {down_count} occasion(s).{current_loss} Averaging down repeatedly can compound losses.",
                    ))

        # Rule 14: Long-held losers > 180 days
        cutoff_180 = today - timedelta(days=180)
        for h in holdings:
            if h.created_at.date() < cutoff_180 and h.current_price < h.average_buy_price:
                days_held = (today - h.created_at.date()).days
                loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                insights.append(_i(
                    f"long_held_loser_{h.ticker}", "behaviour", "warning",
                    f"{h.ticker} has been underwater for {days_held} days",
                    f"You've held {h.ticker} for {days_held} days and it's still {loss_pct:.1f}% below your cost basis of ${h.average_buy_price:.2f}. Is this still the original thesis?",
                ))

        # Rule 15: Idle cash while holding losing positions
        if cash.balance > 1_000 and underwater:
            insights.append(_i(
                "idle_cash_with_losers", "behaviour", "info",
                f"${cash.balance:,.0f} idle while {len(underwater)} position(s) are underwater",
                "You have cash sitting unused while holding losing positions. Consider whether deploying it or cutting losses would be more productive.",
            ))

        # ── OPTIONS ──────────────────────────────────────────────────────────

        # Rule 16: Open options expiring within 7 days
        expiry_cutoff = today + timedelta(days=7)
        expiring_soon = [o for o in open_options if o.expiry_date <= expiry_cutoff]
        if expiring_soon:
            for o in expiring_soon:
                days_left = (o.expiry_date - today).days
                insights.append(_i(
                    f"expiring_soon_{o.id}", "options", "alert",
                    f"{o.ticker} {o.trade_type.replace('_', ' ')} expires in {days_left} day(s)",
                    f"Strike ${o.strike_price} expiring {o.expiry_date}. Decide: let it expire, close, or roll before expiry.",
                ))

        # Rule 17 & 18: ITM / OTM status of open sell positions
        for o in open_sell_calls:
            h = holding_by_ticker.get(o.ticker)
            if not h:
                continue
            if h.current_price > o.strike_price:
                upside_pct = (h.current_price - o.strike_price) / o.strike_price * 100
                insights.append(_i(
                    f"itm_call_{o.id}", "options", "alert",
                    f"{o.ticker} call is in-the-money — assignment risk",
                    f"Stock is at ${h.current_price:.2f}, above your strike of ${o.strike_price:.2f} ({upside_pct:.1f}% ITM). Your shares may be called away. Consider rolling up or accepting assignment.",
                ))
            else:
                otm_pct = (o.strike_price - h.current_price) / h.current_price * 100
                if otm_pct > 15:
                    insights.append(_i(
                        f"deep_otm_call_{o.id}", "options", "info",
                        f"{o.ticker} call is deep OTM ({otm_pct:.1f}%)",
                        f"Strike ${o.strike_price:.2f} is {otm_pct:.1f}% above current price ${h.current_price:.2f}. Premium collected was likely low for the risk taken.",
                    ))

        # ── MISTAKES ─────────────────────────────────────────────────────────

        # Rule 20: Adding to already over-concentrated winner
        for h in holdings:
            pct = alloc[h.id]
            if pct > 30 and len(buy_txns.get(h.ticker, [])) > 2:
                insights.append(_i(
                    f"chasing_concentrated_{h.ticker}", "mistakes", "warning",
                    f"Multiple buys on {h.ticker} which is already {pct:.1f}% of portfolio",
                    f"You've bought {h.ticker} {len(buy_txns[h.ticker])} times and it now dominates your portfolio at {pct:.1f}%. This may be momentum chasing increasing concentration risk.",
                ))

        # Rule 21: Covered call strike below cost basis
        for o in open_sell_calls:
            h = holding_by_ticker.get(o.ticker)
            if h and o.strike_price < h.average_buy_price:
                locked_loss = (h.average_buy_price - o.strike_price) * 100 * o.contracts
                insights.append(_i(
                    f"call_below_cost_basis_{o.id}", "mistakes", "alert",
                    f"{o.ticker} covered call strike is below your cost basis",
                    f"Strike ${o.strike_price:.2f} < cost basis ${h.average_buy_price:.2f}. If called away, you lock in a loss of ~${locked_loss:,.0f}. Consider closing or rolling up.",
                ))

        # Rule 22: Covered calls opened with < 7 DTE
        for o in all_options:
            if o.trade_type == "sell_call":
                dte_at_open = (o.expiry_date - o.open_date).days
                if dte_at_open < 7:
                    insights.append(_i(
                        f"short_dte_call_{o.id}", "mistakes", "warning",
                        f"{o.ticker} call was sold with only {dte_at_open} day(s) to expiry",
                        f"Selling covered calls with < 7 DTE collects minimal premium but retains full assignment risk. Aim for 20–45 DTE for better risk/reward.",
                    ))

        # Rule 24: Selling call on deeply underwater stock
        for o in open_sell_calls:
            h = holding_by_ticker.get(o.ticker)
            if h and h.average_buy_price > 0:
                loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                if loss_pct < -15:
                    premium_vs_loss = (o.premium * 100 * o.contracts) / abs((h.average_buy_price - h.current_price) * h.quantity) * 100
                    insights.append(_i(
                        f"call_on_loser_{o.id}", "mistakes", "warning",
                        f"Covered call on {h.ticker} which is already down {abs(loss_pct):.1f}%",
                        f"The premium collected (${o.premium * 100 * o.contracts:,.0f}) covers only {premium_vs_loss:.1f}% of your current unrealized loss. The call won't rescue this position.",
                    ))

        # Rule 26: No exit plan on long-held losers with > 15% loss
        cutoff_90 = today - timedelta(days=90)
        for h in holdings:
            if h.created_at.date() < cutoff_90 and h.average_buy_price > 0:
                loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                if loss_pct < -15 and h.ticker not in open_option_tickers:
                    days_held = (today - h.created_at.date()).days
                    insights.append(_i(
                        f"no_exit_plan_{h.ticker}", "mistakes", "warning",
                        f"No hedge or exit plan for {h.ticker} after {days_held} days",
                        f"{h.ticker} is {loss_pct:.1f}% below cost basis, held {days_held} days, with no active options hedge. Define a stop-loss level or initiate a covered call.",
                    ))

        # Rule 27: Position down > 25% with no sell and no covered call
        for h in holdings:
            if h.average_buy_price > 0:
                loss_pct = (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                if loss_pct < -25:
                    sells = [t for t in all_txns if t.ticker == h.ticker and t.transaction_type == "sell"]
                    if not sells and h.ticker not in open_option_tickers:
                        insights.append(_i(
                            f"no_stoploss_{h.ticker}", "mistakes", "alert",
                            f"{h.ticker} is down {abs(loss_pct):.1f}% with no stop-loss action",
                            f"No partial sell, no covered call, and no exit on {h.ticker} despite a {loss_pct:.1f}% loss. Hope is not a strategy — define your exit.",
                        ))

        # Rule 28: No new buy in > 60 days with meaningful cash
        buys_all = [t for t in all_txns if t.transaction_type == "buy"]
        if buys_all and cash.balance > 500:
            last_buy = max(buys_all, key=lambda t: t.transaction_date)
            days_since_buy = (today - last_buy.transaction_date).days
            if days_since_buy > 60:
                insights.append(_i(
                    "portfolio_inaction", "mistakes", "info",
                    f"No new position opened in {days_since_buy} days",
                    f"Your last buy was {days_since_buy} days ago and you have ${cash.balance:,.0f} in cash. Intentional or inertia?",
                ))

        # Rule 29: Recent activity concentrated in same 2-3 tickers
        recent_txns = [t for t in all_txns if (today - t.transaction_date).days <= 90]
        if recent_txns and len(holdings) > 4:
            ticker_freq = Counter(t.ticker for t in recent_txns)
            if len(ticker_freq) <= 3:
                top_tickers = ", ".join(t for t, _ in ticker_freq.most_common(3))
                insights.append(_i(
                    "activity_concentration", "mistakes", "info",
                    "Last 90 days of trades concentrated in same tickers",
                    f"All recent trades were in {top_tickers}. You have {len(holdings)} holdings but are only actively managing a few.",
                ))

        # Rule 30: Options trades concentrated on same 1-2 underlyings
        all_options_tickers = [o.ticker for o in all_options]
        if len(all_options_tickers) >= 4:
            options_ticker_freq = Counter(all_options_tickers)
            top_1_pct = options_ticker_freq.most_common(1)[0][1] / len(all_options_tickers) * 100
            if top_1_pct > 60:
                top_ticker = options_ticker_freq.most_common(1)[0][0]
                insights.append(_i(
                    "options_concentration", "mistakes", "warning",
                    f"{top_1_pct:.0f}% of your options activity is on {top_ticker}",
                    f"Options P&L is not diversified — {top_ticker} dominates your options book. A bad move in that stock hits your options income too.",
                ))

        # Rule 31: Multiple holdings in same sector all losing
        sector_groups: dict[str, list] = defaultdict(list)
        for h in holdings:
            if h.sector:
                sector_groups[h.sector].append(h)
        for sector, hs in sector_groups.items():
            if len(hs) >= 2:
                all_losing = all(h.current_price < h.average_buy_price for h in hs)
                if all_losing:
                    tickers = ", ".join(h.ticker for h in hs)
                    avg_loss = sum(
                        (h.current_price - h.average_buy_price) / h.average_buy_price * 100
                        for h in hs
                    ) / len(hs)
                    insights.append(_i(
                        f"correlated_sector_loss_{sector.lower().replace(' ', '_')}",
                        "mistakes", "warning",
                        f"All {sector} holdings are losing ({avg_loss:.1f}% avg)",
                        f"{tickers} are all underwater. These positions are correlated — this is sector exposure, not diversification.",
                    ))

        # Sort: alerts first, then warnings, then info
        severity_order = {"alert": 0, "warning": 1, "info": 2}
        insights.sort(key=lambda i: severity_order.get(i.severity, 3))

        return insights
