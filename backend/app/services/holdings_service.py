"""Service layer for holdings business logic and portfolio metrics."""

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.transaction import Transaction
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.price_history_repository import PriceHistoryRepository
from app.schemas.holding import HoldingCreate, HoldingResponse, HoldingUpdate


class HoldingsService:
    """Business logic for holdings CRUD and portfolio metric calculations."""

    @staticmethod
    def _calculate_total_portfolio_value(
        db: Session, holding_type: str | None = None
    ) -> float:
        """Calculate the total portfolio value for a given holding type."""
        holdings = (
            HoldingsRepository.get_all(db)
            if holding_type is None
            else HoldingsRepository.get_all_by_type(db, holding_type)
        )
        return sum(h.current_price * h.quantity for h in holdings)

    @staticmethod
    def _get_previous_close(db: Session, ticker: str) -> float | None:
        """Retrieve the most recent prior close price for a ticker."""
        history = PriceHistoryRepository.get_history(db, ticker, days=365)
        if not history:
            return None

        latest = history[-1]
        if latest.open_price is not None:
            return latest.open_price

        return latest.close_price

    @staticmethod
    def _build_holding_response(
        db: Session, holding: Holding, total_portfolio_value: float
    ) -> HoldingResponse:
        """Build a HoldingResponse with all calculated fields."""
        total_invested = holding.average_buy_price * holding.quantity
        current_value = holding.current_price * holding.quantity
        unrealized_gain = (
            holding.current_price - holding.average_buy_price
        ) * holding.quantity

        if holding.average_buy_price > 0:
            unrealized_gain_pct = round(
                (
                    (holding.current_price - holding.average_buy_price)
                    / holding.average_buy_price
                )
                * 100,
                2,
            )
        else:
            unrealized_gain_pct = 0.0

        if total_portfolio_value > 0:
            allocation_pct = round(
                (current_value / total_portfolio_value) * 100, 2
            )
        else:
            allocation_pct = 0.0

        previous_close = HoldingsService._get_previous_close(db, holding.ticker)
        if previous_close is not None and previous_close != 0:
            daily_change = round(
                (holding.current_price - previous_close) * holding.quantity,
                2,
            )
            daily_change_pct = round(
                ((holding.current_price - previous_close) / previous_close) * 100,
                2,
            )
        else:
            daily_change = 0.0
            daily_change_pct = 0.0

        # annual_dividend_income = dividend_per_share * quantity
        # We use dividend_yield (stored as decimal, e.g. 0.05 = 5%) only as display.
        # The actual income is: dividend_yield * current_price * quantity
        # But dividend_yield from yfinance can be inflated for some ETFs.
        # Better approach: use the stored dividend_yield as the per-share rate
        # if it's reasonable (< 0.20 = 20%), otherwise cap it.
        dividend_yield = holding.dividend_yield if holding.dividend_yield else 0.0

        # Cap dividend yield at 20% to avoid unrealistic values from yfinance
        # (some ETFs report return-of-capital as dividends, inflating the yield)
        capped_yield = min(dividend_yield, 0.20)
        annual_dividend_income = round(capped_yield * holding.current_price * holding.quantity, 2)

        return HoldingResponse(
            id=holding.id,
            ticker=holding.ticker,
            company_name=holding.company_name,
            quantity=holding.quantity,
            average_buy_price=holding.average_buy_price,
            current_price=holding.current_price,
            total_invested=total_invested,
            current_value=current_value,
            daily_change=daily_change,
            daily_change_pct=daily_change_pct,
            unrealized_gain=unrealized_gain,
            unrealized_gain_pct=unrealized_gain_pct,
            allocation_pct=allocation_pct,
            sector=holding.sector,
            industry=holding.industry,
            dividend_yield=dividend_yield,
            annual_dividend_income=annual_dividend_income,
            broker=holding.broker,
            holding_type=holding.holding_type,
            created_at=holding.created_at,
            updated_at=holding.updated_at,
        )

    @staticmethod
    def get_all_holdings(
        db: Session, holding_type: str | None = None
    ) -> list[HoldingResponse]:
        """Retrieve all holdings with calculated metrics.

        If holding_type is provided, only holdings of that type are returned.
        """
        holdings = (
            HoldingsRepository.get_all(db)
            if holding_type is None
            else HoldingsRepository.get_all_by_type(db, holding_type)
        )
        total_portfolio_value = HoldingsService._calculate_total_portfolio_value(
            db, holding_type
        )

        return [
            HoldingsService._build_holding_response(db, h, total_portfolio_value)
            for h in holdings
        ]

    @staticmethod
    def get_holding(
        db: Session, holding_id: int, holding_type: str | None = None
    ) -> HoldingResponse:
        """Retrieve a single holding by ID with calculated metrics.

        Raises HTTPException 404 if the holding does not exist.
        """
        holding = (
            HoldingsRepository.get_by_id(db, holding_id)
            if holding_type is None
            else HoldingsRepository.get_by_id_and_type(db, holding_id, holding_type)
        )
        if holding is None:
            raise HTTPException(status_code=404, detail="Holding not found")

        total_portfolio_value = HoldingsService._calculate_total_portfolio_value(
            db, holding_type
        )
        return HoldingsService._build_holding_response(db, holding, total_portfolio_value)

    @staticmethod
    def create_holding(
        db: Session, data: HoldingCreate, holding_type: str = 'stock'
    ) -> HoldingResponse:
        """Create a new holding with an initial buy transaction.

        Steps:
        1. Check if ticker already exists for this holding type
        2. Fetch current market price from yfinance
        3. Create Holding record
        4. Create initial Transaction record (type="buy", quantity and price
           from input, date=today)
        5. Decrease cash balance by (quantity × buy_price)

        Raises HTTPException 400 if ticker already exists.
        """
        from app.services.market_data_service import MarketDataService

        # Check for duplicate ticker in this holding type
        existing = HoldingsRepository.get_by_ticker_and_type(
            db, data.ticker, holding_type
        )
        if existing is not None:
            raise HTTPException(
                status_code=400,
                detail=f"A {holding_type} holding for ticker '{data.ticker}' already exists",
            )

        # Fetch current market price
        current_price = data.buy_price  # fallback to buy price
        dividend_yield = 0.0
        quote = MarketDataService.fetch_quote(data.ticker)
        if quote is not None:
            current_price = quote.current_price
            raw_yield = quote.dividend_yield or 0.0
            dividend_yield = min(raw_yield, 0.20)

        # Create the holding record
        holding = Holding(
            ticker=data.ticker,
            company_name=data.company_name,
            quantity=data.quantity,
            average_buy_price=data.buy_price,
            current_price=current_price,
            holding_type=holding_type,
            sector=data.sector,
            industry=data.industry,
            dividend_yield=dividend_yield,
            broker=data.broker,
            notes=data.notes,
        )
        holding = HoldingsRepository.create(db, holding)

        # Create initial buy transaction
        transaction = Transaction(
            holding_id=holding.id,
            ticker=data.ticker,
            transaction_type="buy",
            quantity=data.quantity,
            price=data.buy_price,
            fees=0.0,
            transaction_date=date.today(),
        )
        db.add(transaction)

        # Decrease cash balance by (quantity × buy_price)
        cash_balance = CashBalanceRepository.get_balance(db)
        new_balance = cash_balance.balance - (data.quantity * data.buy_price)
        CashBalanceRepository.update_balance(db, new_balance)

        # Refresh holding to get updated timestamps
        db.refresh(holding)

        total_portfolio_value = HoldingsService._calculate_total_portfolio_value(
            db, holding_type
        )
        return HoldingsService._build_holding_response(db, holding, total_portfolio_value)

    @staticmethod
    def update_holding(
        db: Session,
        holding_id: int,
        data: HoldingUpdate,
        holding_type: str | None = None,
    ) -> HoldingResponse:
        """Update editable fields of a holding.

        Only company_name, sector, industry, and notes are editable.
        Raises HTTPException 404 if the holding does not exist.
        """
        holding = (
            HoldingsRepository.get_by_id(db, holding_id)
            if holding_type is None
            else HoldingsRepository.get_by_id_and_type(db, holding_id, holding_type)
        )
        if holding is None:
            raise HTTPException(status_code=404, detail="Holding not found")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(holding, field, value)

        holding = HoldingsRepository.update(db, holding)

        total_portfolio_value = HoldingsService._calculate_total_portfolio_value(
            db, holding_type
        )
        return HoldingsService._build_holding_response(db, holding, total_portfolio_value)

    @staticmethod
    def delete_holding(
        db: Session, holding_id: int, holding_type: str | None = None
    ) -> None:
        """Delete a holding and return invested amount to cash balance.

        Steps:
        1. Get holding (raise 404 if not found)
        2. Increase cash balance by (quantity × average_buy_price)
        3. Delete holding (cascade deletes transactions)
        """
        holding = (
            HoldingsRepository.get_by_id(db, holding_id)
            if holding_type is None
            else HoldingsRepository.get_by_id_and_type(db, holding_id, holding_type)
        )
        if holding is None:
            raise HTTPException(status_code=404, detail="Holding not found")

        return_amount = holding.quantity * holding.average_buy_price
        cash_balance = CashBalanceRepository.get_balance(db)
        new_balance = cash_balance.balance + return_amount
        CashBalanceRepository.update_balance(db, new_balance)

        HoldingsRepository.delete(db, holding_id)
