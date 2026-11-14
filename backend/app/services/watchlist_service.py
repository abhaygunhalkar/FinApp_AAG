"""Business logic service for watchlist operations."""

from sqlalchemy.orm import Session

from app.models.watchlist_item import WatchlistItem
from app.repositories.watchlist_repository import WatchlistRepository
from app.schemas.holding import HoldingCreate, HoldingResponse
from app.schemas.watchlist import WatchlistCreate, WatchlistResponse, WatchlistUpdate


class WatchlistService:
    """Service layer for watchlist business logic."""

    @staticmethod
    def get_all_items(db: Session) -> list[WatchlistResponse]:
        """Retrieve all watchlist items with live market data and RSI."""
        from app.services.market_data_service import MarketDataService

        items = WatchlistRepository.get_all(db)
        responses = []

        for item in items:
            # Try to get live quote data
            quote = MarketDataService.fetch_quote(item.ticker)

            # Fetch RSI values
            rsi_daily, rsi_weekly = MarketDataService.fetch_rsi(item.ticker)

            if quote is not None:
                # Update stored current_price
                item.current_price = quote.current_price
                WatchlistRepository.update(db, item)

                responses.append(
                    WatchlistResponse(
                        id=item.id,
                        ticker=item.ticker,
                        company_name=item.company_name,
                        current_price=quote.current_price,
                        daily_change_pct=quote.daily_change_pct,
                        week_52_high=quote.week_52_high,
                        week_52_low=quote.week_52_low,
                        target_buy_price=item.target_buy_price,
                        analyst_rating=quote.analyst_rating,
                        pe_ratio=quote.pe_ratio,
                        market_cap=quote.market_cap,
                        sector=item.sector,
                        notes=item.notes,
                        priority=item.priority,
                        rsi_daily=rsi_daily,
                        rsi_weekly=rsi_weekly,
                        created_at=item.created_at,
                        updated_at=item.updated_at,
                    )
                )
            else:
                resp = WatchlistService._to_response(item)
                resp.rsi_daily = rsi_daily
                resp.rsi_weekly = rsi_weekly
                responses.append(resp)

        return responses

    @staticmethod
    def create_item(db: Session, data: WatchlistCreate) -> WatchlistResponse:
        """Create a new watchlist item.

        Raises:
            ValueError: If the ticker already exists in the watchlist.
        """
        existing = WatchlistRepository.get_by_ticker(db, data.ticker)
        if existing:
            raise ValueError(f"Ticker '{data.ticker}' is already on the watchlist")

        # Fetch market data for the ticker
        from app.services.market_data_service import MarketDataService

        company_name = None
        current_price = 0.0
        sector = None
        daily_change_pct = 0.0
        week_52_high = 0.0
        week_52_low = 0.0
        analyst_rating = None
        pe_ratio = None
        market_cap = None

        quote = MarketDataService.fetch_quote(data.ticker)
        if quote is not None:
            current_price = quote.current_price
            daily_change_pct = quote.daily_change_pct
            week_52_high = quote.week_52_high
            week_52_low = quote.week_52_low
            analyst_rating = quote.analyst_rating
            pe_ratio = quote.pe_ratio
            market_cap = quote.market_cap

        # Fetch company info (name, sector, industry)
        try:
            import yfinance as yf

            stock = yf.Ticker(data.ticker)
            info = stock.info
            company_name = info.get("longName") or info.get("shortName")
            sector = info.get("sector")
        except Exception:
            pass  # Non-critical, continue without company info

        item = WatchlistItem(
            ticker=data.ticker,
            company_name=company_name,
            current_price=current_price,
            target_buy_price=data.target_buy_price,
            priority=data.priority,
            sector=sector,
            notes=data.notes,
        )
        created_item = WatchlistRepository.create(db, item)

        # Return response with fetched market data
        return WatchlistResponse(
            id=created_item.id,
            ticker=created_item.ticker,
            company_name=created_item.company_name,
            current_price=created_item.current_price,
            daily_change_pct=daily_change_pct,
            week_52_high=week_52_high,
            week_52_low=week_52_low,
            target_buy_price=created_item.target_buy_price,
            analyst_rating=analyst_rating,
            pe_ratio=pe_ratio,
            market_cap=market_cap,
            sector=created_item.sector,
            notes=created_item.notes,
            priority=created_item.priority,
            created_at=created_item.created_at,
            updated_at=created_item.updated_at,
        )

    @staticmethod
    def update_item(
        db: Session, item_id: int, data: WatchlistUpdate
    ) -> WatchlistResponse:
        """Update an existing watchlist item.

        Raises:
            ValueError: If the watchlist item is not found.
        """
        item = WatchlistRepository.get_by_id(db, item_id)
        if not item:
            raise ValueError(f"Watchlist item with id {item_id} not found")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(item, field, value)

        updated_item = WatchlistRepository.update(db, item)
        return WatchlistService._to_response(updated_item)

    @staticmethod
    def delete_item(db: Session, item_id: int) -> None:
        """Delete a watchlist item.

        Raises:
            ValueError: If the watchlist item is not found.
        """
        item = WatchlistRepository.get_by_id(db, item_id)
        if not item:
            raise ValueError(f"Watchlist item with id {item_id} not found")

        WatchlistRepository.delete(db, item_id)

    @staticmethod
    def move_to_holdings(
        db: Session, item_id: int, holding_data: HoldingCreate
    ) -> HoldingResponse:
        """Move a watchlist item to holdings.

        Creates a new holding from the watchlist item data and removes
        the item from the watchlist.

        Raises:
            ValueError: If the watchlist item is not found.
        """
        # Import here to avoid circular imports
        from app.services.holdings_service import HoldingsService

        item = WatchlistRepository.get_by_id(db, item_id)
        if not item:
            raise ValueError(f"Watchlist item with id {item_id} not found")

        # Create the holding using HoldingsService
        holding_response = HoldingsService.create_holding(db, holding_data)

        # Delete the watchlist item
        WatchlistRepository.delete(db, item_id)

        return holding_response

    @staticmethod
    def _to_response(item: WatchlistItem) -> WatchlistResponse:
        """Convert a WatchlistItem model to a WatchlistResponse schema."""
        return WatchlistResponse(
            id=item.id,
            ticker=item.ticker,
            company_name=item.company_name,
            current_price=item.current_price,
            daily_change_pct=0.0,
            week_52_high=0.0,
            week_52_low=0.0,
            target_buy_price=item.target_buy_price,
            analyst_rating=None,
            pe_ratio=None,
            market_cap=None,
            sector=item.sector,
            notes=item.notes,
            priority=item.priority,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
