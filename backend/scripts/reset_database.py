"""Reset Database Script

Deletes all records from all tables while preserving the schema.
Cash balance is reset to 0.

Usage:
    cd backend
    source .venv/bin/activate
    python scripts/reset_database.py
"""

from app.database import SessionLocal
from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.price_history import PriceHistory
from app.models.transaction import Transaction
from app.models.watchlist_item import WatchlistItem


def reset_database() -> None:
    db = SessionLocal()
    try:
        # Delete in order to respect foreign keys
        deleted_transactions = db.query(Transaction).delete()
        deleted_holdings = db.query(Holding).delete()
        deleted_watchlist = db.query(WatchlistItem).delete()
        deleted_price_history = db.query(PriceHistory).delete()

        # Reset cash balance to 0
        cash = db.query(CashBalance).first()
        if cash:
            cash.balance = 0.0
        else:
            db.add(CashBalance(balance=0.0))

        db.commit()

        print("Database reset complete:")
        print(f"  Transactions deleted: {deleted_transactions}")
        print(f"  Holdings deleted:     {deleted_holdings}")
        print(f"  Watchlist deleted:    {deleted_watchlist}")
        print(f"  Price history deleted: {deleted_price_history}")
        print("  Cash balance reset to: $0.00")
        print("\nAll tables are now empty. Ready for fresh data.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    confirm = input("This will DELETE ALL DATA. Type 'yes' to confirm: ")
    if confirm.strip().lower() == "yes":
        reset_database()
    else:
        print("Cancelled.")
