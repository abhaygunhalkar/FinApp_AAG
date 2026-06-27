"""Service layer for options trades and summary computations."""
from collections import namedtuple
from datetime import date, datetime, timedelta
from typing import List

from sqlalchemy.orm import Session

from app.repositories.options_repository import OptionsRepository
from app.schemas.options import OptionQuoteResponse, OptionsTradeResponse, OptionsSummary
from app.services.market_data_service import MarketDataService


class OptionsService:
    @staticmethod
    def _calculate_pnl_for_trade(trade) -> float | None:
        # P&L rules per spec
        if trade.status == 'open':
            return None
        contracts = trade.contracts or 0
        multiplier = contracts * 100
        premium = trade.premium or 0.0
        close_price = trade.close_price
        # Credit trades (sell_put/sell_call) collect premium up front; debit
        # trades (buy_put/buy_call) pay premium up front, so the sign of
        # every outcome is mirrored.
        is_credit = trade.trade_type.startswith('sell_')

        if trade.status == 'closed':
            if close_price is None:
                return None
            if is_credit:
                return round((premium - close_price) * multiplier, 2)
            return round((close_price - premium) * multiplier, 2)
        if trade.status in ('expired_worthless', 'assigned'):
            if is_credit:
                return round(premium * multiplier, 2)
            return round(-premium * multiplier, 2)
        return None

    @staticmethod
    def list_trades(db: Session) -> List[OptionsTradeResponse]:
        trades = OptionsRepository.get_all(db)
        result = []
        for t in trades:
            pnl = OptionsService._calculate_pnl_for_trade(t)
            obj = OptionsTradeResponse.from_orm(t)
            obj.pnl = pnl
            result.append(obj)
        return result

    @staticmethod
    def get_monthly_pnl(db: Session) -> list[dict]:
        """Return realized P&L per closed/expired/assigned trade, keyed by expiry_date."""
        trades = OptionsRepository.get_all(db)
        result = []
        for trade in trades:
            if trade.status not in ('closed', 'expired_worthless'):
                continue
            pnl = OptionsService._calculate_pnl_for_trade(trade)
            if pnl is not None:
                result.append({
                    "transaction_date": trade.expiry_date.isoformat(),
                    "realized_gain": pnl,
                })
        return result

    @staticmethod
    def get_trade(db: Session, id: int) -> OptionsTradeResponse | None:
        t = OptionsRepository.get_by_id(db, id)
        if not t:
            return None
        obj = OptionsTradeResponse.from_orm(t)
        obj.pnl = OptionsService._calculate_pnl_for_trade(t)
        return obj

    @staticmethod
    def create_trade(db: Session, payload: dict) -> OptionsTradeResponse:
        obj = OptionsRepository.create(db, payload)
        resp = OptionsTradeResponse.from_orm(obj)
        resp.pnl = OptionsService._calculate_pnl_for_trade(obj)
        return resp

    @staticmethod
    def update_trade(db: Session, id: int, payload: dict) -> OptionsTradeResponse | None:
        obj = OptionsRepository.update(db, id, payload)
        if not obj:
            return None
        resp = OptionsTradeResponse.from_orm(obj)
        resp.pnl = OptionsService._calculate_pnl_for_trade(obj)
        return resp

    @staticmethod
    def delete_trade(db: Session, id: int) -> None:
        OptionsRepository.delete(db, id)

    @staticmethod
    def get_summary(db: Session) -> OptionsSummary:
        trades = OptionsRepository.get_all(db)
        total_pnl = 0.0
        open_positions = 0
        closed_or_expired_count = 0
        winning_count = 0

        today = date.today()
        week_ahead = today + timedelta(days=7)
        expiring_this_week = OptionsRepository.count_expiring_between(db, today, week_ahead)

        for t in trades:
            pnl = OptionsService._calculate_pnl_for_trade(t)
            if t.status == 'open':
                open_positions += 1
            if pnl is not None:
                total_pnl += pnl
                closed_or_expired_count += 1
                if pnl > 0:
                    winning_count += 1

        win_rate = round((winning_count / closed_or_expired_count) * 100, 2) if closed_or_expired_count > 0 else 0.0

        return OptionsSummary(
            total_pnl=round(total_pnl, 2),
            open_positions=open_positions,
            expiring_this_week=expiring_this_week,
            win_rate=win_rate,
        )

    @staticmethod
    def _calculate_unrealized_pnl(
        trade_type: str, premium: float, contracts: int, current_price: float
    ) -> float:
        multiplier = (contracts or 0) * 100
        is_credit = trade_type.startswith("sell_")
        if is_credit:
            return round((premium - current_price) * multiplier, 2)
        return round((current_price - premium) * multiplier, 2)

    @staticmethod
    def get_open_trade_quotes(db: Session) -> dict[int, OptionQuoteResponse]:
        """Fetch live bid/ask quotes (and derived unrealized P&L) for every open
        options trade, sourced from yfinance. Trades whose ticker/expiry/strike
        can't be resolved to a live contract are simply omitted from the result.

        Option chains are cached per (ticker, expiry) within a single call so
        multiple open positions on the same underlying/expiry only hit
        yfinance once.
        """
        trades = [t for t in OptionsRepository.get_all(db) if t.status == "open"]
        chain_cache: dict[tuple[str, date], tuple | None] = {}
        results: dict[int, OptionQuoteResponse] = {}

        for trade in trades:
            cache_key = (trade.ticker, trade.expiry_date)
            if cache_key not in chain_cache:
                chain_cache[cache_key] = MarketDataService.fetch_option_chain(
                    trade.ticker, trade.expiry_date
                )
            chain = chain_cache[cache_key]
            if chain is None:
                continue

            calls, puts = chain
            chain_side = calls if trade.trade_type.endswith("_call") else puts
            quote_data = MarketDataService.extract_option_quote(chain_side, trade.strike_price)
            if quote_data is None:
                continue

            unrealized_pnl = None
            if quote_data["current_price"] is not None:
                unrealized_pnl = OptionsService._calculate_unrealized_pnl(
                    trade.trade_type, trade.premium, trade.contracts, quote_data["current_price"]
                )

            results[trade.id] = OptionQuoteResponse(
                bid=quote_data["bid"],
                ask=quote_data["ask"],
                last_price=quote_data["last_price"],
                current_price=quote_data["current_price"],
                unrealized_pnl=unrealized_pnl,
            )

        return results
