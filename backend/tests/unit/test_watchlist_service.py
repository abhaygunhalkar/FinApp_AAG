"""Unit tests for the WatchlistService."""

import pytest
from sqlalchemy.orm import Session

from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.watchlist_item import WatchlistItem
from app.schemas.holding import HoldingCreate
from app.schemas.watchlist import WatchlistCreate, WatchlistUpdate
from app.services.watchlist_service import WatchlistService


class TestGetAllItems:
    """Tests for WatchlistService.get_all_items."""

    def test_returns_empty_list_when_no_items(self, db_session: Session) -> None:
        result = WatchlistService.get_all_items(db_session)
        assert result == []

    def test_returns_all_watchlist_items(self, db_session: Session) -> None:
        item1 = WatchlistItem(ticker="AAPL", current_price=175.0, priority=1)
        item2 = WatchlistItem(ticker="MSFT", current_price=350.0, priority=2)
        db_session.add_all([item1, item2])
        db_session.commit()

        result = WatchlistService.get_all_items(db_session)
        assert len(result) == 2
        tickers = {r.ticker for r in result}
        assert tickers == {"AAPL", "MSFT"}

    @pytest.mark.usefixtures("offline_market")
    def test_response_includes_computed_defaults(self, db_session: Session) -> None:
        item = WatchlistItem(
            ticker="GOOG",
            current_price=140.0,
            target_buy_price=130.0,
            priority=2,
            notes="Watch for dip",
        )
        db_session.add(item)
        db_session.commit()

        result = WatchlistService.get_all_items(db_session)
        assert len(result) == 1

        resp = result[0]
        assert resp.ticker == "GOOG"
        assert resp.current_price == 140.0
        assert resp.daily_change_pct == 0.0
        assert resp.week_52_high == 0.0
        assert resp.week_52_low == 0.0
        assert resp.analyst_rating is None
        assert resp.pe_ratio is None
        assert resp.market_cap is None
        assert resp.target_buy_price == 130.0
        assert resp.priority == 2
        assert resp.notes == "Watch for dip"


class TestCreateItem:
    """Tests for WatchlistService.create_item."""

    def test_creates_watchlist_item(self, db_session: Session) -> None:
        data = WatchlistCreate(
            ticker="AAPL",
            target_buy_price=150.0,
            priority=1,
            notes="Buy on dip",
        )

        result = WatchlistService.create_item(db_session, data)

        assert result.ticker == "AAPL"
        assert result.target_buy_price == 150.0
        assert result.priority == 1
        assert result.notes == "Buy on dip"

    def test_creates_item_with_defaults(self, db_session: Session) -> None:
        data = WatchlistCreate(ticker="TSLA")

        result = WatchlistService.create_item(db_session, data)

        assert result.ticker == "TSLA"
        assert result.target_buy_price is None
        assert result.priority == 3
        assert result.notes is None

    def test_rejects_duplicate_ticker(self, db_session: Session) -> None:
        item = WatchlistItem(ticker="AAPL", current_price=175.0)
        db_session.add(item)
        db_session.commit()

        data = WatchlistCreate(ticker="AAPL", priority=2)

        with pytest.raises(ValueError, match="already on the watchlist"):
            WatchlistService.create_item(db_session, data)


class TestUpdateItem:
    """Tests for WatchlistService.update_item."""

    def test_updates_watchlist_item_fields(self, db_session: Session) -> None:
        item = WatchlistItem(ticker="AAPL", current_price=175.0, priority=3)
        db_session.add(item)
        db_session.commit()

        data = WatchlistUpdate(
            target_buy_price=160.0,
            priority=1,
            sector="Technology",
            notes="Updated notes",
        )

        result = WatchlistService.update_item(db_session, item.id, data)

        assert result.target_buy_price == 160.0
        assert result.priority == 1
        assert result.sector == "Technology"
        assert result.notes == "Updated notes"

    def test_partial_update(self, db_session: Session) -> None:
        item = WatchlistItem(
            ticker="MSFT",
            current_price=350.0,
            priority=2,
            notes="Original notes",
        )
        db_session.add(item)
        db_session.commit()

        data = WatchlistUpdate(priority=5)

        result = WatchlistService.update_item(db_session, item.id, data)

        assert result.priority == 5
        # Other fields remain unchanged
        assert result.notes == "Original notes"

    def test_raises_value_error_for_nonexistent_item(self, db_session: Session) -> None:
        data = WatchlistUpdate(priority=1)

        with pytest.raises(ValueError, match="not found"):
            WatchlistService.update_item(db_session, 999, data)


class TestDeleteItem:
    """Tests for WatchlistService.delete_item."""

    def test_deletes_watchlist_item(self, db_session: Session) -> None:
        item = WatchlistItem(ticker="AAPL", current_price=175.0)
        db_session.add(item)
        db_session.commit()
        item_id = item.id

        WatchlistService.delete_item(db_session, item_id)

        # Verify item is deleted
        remaining = (
            db_session.query(WatchlistItem).filter(WatchlistItem.id == item_id).first()
        )
        assert remaining is None

    def test_raises_value_error_for_nonexistent_item(self, db_session: Session) -> None:
        with pytest.raises(ValueError, match="not found"):
            WatchlistService.delete_item(db_session, 999)


class TestMoveToHoldings:
    """Tests for WatchlistService.move_to_holdings."""

    def test_moves_watchlist_item_to_holdings(self, db_session: Session) -> None:
        # Set up cash balance for HoldingsService.create_holding
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)
        db_session.commit()

        item = WatchlistItem(
            ticker="AAPL",
            company_name="Apple Inc.",
            current_price=175.0,
            sector="Technology",
            notes="Ready to buy",
        )
        db_session.add(item)
        db_session.commit()
        item_id = item.id

        holding_data = HoldingCreate(
            ticker="AAPL",
            quantity=10.0,
            buy_price=170.0,
            company_name="Apple Inc.",
            sector="Technology",
        )

        result = WatchlistService.move_to_holdings(db_session, item_id, holding_data)

        # Verify holding was created
        assert result.ticker == "AAPL"
        assert result.quantity == 10.0
        assert result.average_buy_price == 170.0

        # Verify watchlist item was deleted
        remaining = (
            db_session.query(WatchlistItem).filter(WatchlistItem.id == item_id).first()
        )
        assert remaining is None

        # Verify holding exists in DB
        holding = db_session.query(Holding).filter(Holding.ticker == "AAPL").first()
        assert holding is not None
        assert holding.quantity == 10.0

    def test_raises_value_error_for_nonexistent_item(self, db_session: Session) -> None:
        holding_data = HoldingCreate(ticker="AAPL", quantity=10.0, buy_price=170.0)

        with pytest.raises(ValueError, match="not found"):
            WatchlistService.move_to_holdings(db_session, 999, holding_data)
