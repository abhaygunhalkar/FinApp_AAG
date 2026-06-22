"""Service layer for options trades and summary computations."""
from collections import namedtuple
from datetime import date, datetime, timedelta
from typing import List

from sqlalchemy.orm import Session

from app.repositories.options_repository import OptionsRepository
from app.schemas.options import OptionsTradeResponse, OptionsSummary


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
