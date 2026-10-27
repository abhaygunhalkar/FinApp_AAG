"""DEMO ONLY: create a separate database filled with made-up data for showing the app.

This never touches your real database. Positions, trades, accounts, bills and
income are fictional. Stock prices are real historical closes from Yahoo
Finance so charts and gains look natural. See README.md in this folder.

Usage (from backend/):
    python scripts/demo/seed_demo_data.py                 # writes ./finance_demo.db
    python scripts/demo/seed_demo_data.py path/to/x_demo.db

Then run the app against it:
    DATABASE_URL=sqlite:///./finance_demo.db uvicorn app.main:app --port 8000

Refuses to write to any file whose name does not contain "demo", so it can't
overwrite a real database. An existing demo file is replaced.
"""

import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import yfinance as yf
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    CashBalance,
    EarningsCache,
    FinancialAccount,
    Holding,
    IncomeSource,
    NetWorthSnapshot,
    OptionsTrade,
    PriceHistory,
    RecurringExpense,
    Transaction,
    WatchlistItem,
)

TODAY = date.today()
random.seed(42)

# ticker: (name, sector, industry, dividend_yield, broker, buy lots as (days_ago, qty))
STOCKS = {
    "AAPL": (
        "Apple Inc.",
        "Technology",
        "Consumer Electronics",
        0.45,
        "Schwab",
        [(330, 25), (150, 15)],
    ),
    "MSFT": (
        "Microsoft Corporation",
        "Technology",
        "Software",
        0.75,
        "Schwab",
        [(300, 20)],
    ),
    "NVDA": (
        "NVIDIA Corporation",
        "Technology",
        "Semiconductors",
        0.03,
        "Robinhood",
        [(320, 60), (90, 20)],
    ),
    "GOOGL": (
        "Alphabet Inc.",
        "Communication Services",
        "Internet Content",
        0.45,
        "Schwab",
        [(270, 30)],
    ),
    "AMZN": (
        "Amazon.com, Inc.",
        "Consumer Cyclical",
        "Internet Retail",
        0.0,
        "Robinhood",
        [(240, 35)],
    ),
    "JPM": (
        "JPMorgan Chase & Co.",
        "Financial Services",
        "Banks",
        2.1,
        "Merrill",
        [(310, 20)],
    ),
    "JNJ": (
        "Johnson & Johnson",
        "Healthcare",
        "Drug Manufacturers",
        3.1,
        "Merrill",
        [(280, 18)],
    ),
    "KO": (
        "The Coca-Cola Company",
        "Consumer Defensive",
        "Beverages",
        2.9,
        "Merrill",
        [(340, 60)],
    ),
    "V": (
        "Visa Inc.",
        "Financial Services",
        "Credit Services",
        0.7,
        "Schwab",
        [(200, 15)],
    ),
    "COST": (
        "Costco Wholesale Corporation",
        "Consumer Defensive",
        "Discount Stores",
        0.5,
        "Schwab",
        [(260, 5)],
    ),
    "XOM": (
        "Exxon Mobil Corporation",
        "Energy",
        "Oil & Gas",
        3.4,
        "Robinhood",
        [(180, 30)],
    ),
    "DIS": (
        "The Walt Disney Company",
        "Communication Services",
        "Entertainment",
        0.9,
        "Robinhood",
        [(220, 30)],
    ),
}
# Partial sells of held positions: (ticker, days_ago, qty)
SELLS = [("NVDA", 60, 15), ("AAPL", 45, 10), ("XOM", 20, 5)]
# Fully sold positions (no holding left): ticker, buy (days_ago, qty), sell days_ago
CLOSED = [("INTC", (300, 80), 120), ("NFLX", (250, 6), 75)]

ETFS = {
    "VOO": ("Vanguard S&P 500 ETF", 1.3, "Schwab", [(350, 12), (120, 8)]),
    "QQQ": ("Invesco QQQ Trust", 0.6, "Robinhood", [(290, 15)]),
    "SCHD": ("Schwab U.S. Dividend Equity ETF", 3.6, "Schwab", [(330, 120)]),
    "VXUS": ("Vanguard Total International Stock ETF", 3.0, "Merrill", [(210, 40)]),
}

# ticker: (name, sector, target as fraction of current price, priority, note)
WATCHLIST = {
    "TSLA": (
        "Tesla, Inc.",
        "Consumer Cyclical",
        0.85,
        2,
        "Wait for a pullback after earnings",
    ),
    "AMD": (
        "Advanced Micro Devices, Inc.",
        "Technology",
        0.9,
        1,
        "AI GPU share vs NVDA",
    ),
    "CRM": ("Salesforce, Inc.", "Technology", 0.92, 3, None),
    "PLTR": (
        "Palantir Technologies Inc.",
        "Technology",
        0.75,
        4,
        "Valuation stretched",
    ),
    "LLY": ("Eli Lilly and Company", "Healthcare", 0.9, 2, "GLP-1 demand"),
}


def fetch_closes(tickers: list[str]) -> dict[str, dict[date, float]]:
    data = yf.download(
        tickers, period="1y", interval="1d", auto_adjust=False, progress=False
    )
    closes: dict[str, dict[date, float]] = {}
    for t in tickers:
        series = data["Close"][t].dropna()
        closes[t] = {ts.date(): round(float(v), 2) for ts, v in series.items()}
        if not closes[t]:
            raise SystemExit(f"No price data for {t}; check your internet connection.")
    return closes


def price_on(closes: dict[date, float], days_ago: int) -> tuple[date, float]:
    """Close on the last trading day at or before `days_ago` days back."""
    target = TODAY - timedelta(days=days_ago)
    candidates = [d for d in closes if d <= target] or [min(closes)]
    d = max(candidates)
    return d, closes[d]


def latest(closes: dict[date, float]) -> float:
    return closes[max(closes)]


def seed(db: Session, closes: dict[str, dict[date, float]]) -> None:
    holding_ids: dict[str, int] = {}

    def add_holding(
        ticker: str,
        kind: str,
        name: str,
        sector: str | None,
        industry: str | None,
        dy: float,
        broker: str,
        lots: list[tuple[int, int]],
        sold: list[tuple[int, int]],
    ) -> None:
        buys = [(price_on(closes[ticker], ago), qty) for ago, qty in lots]
        bought = sum(q for _, q in buys)
        cost = sum(p * q for (_, p), q in buys)
        qty = bought - sum(q for _, q in sold)
        h = Holding(
            ticker=ticker,
            company_name=name,
            quantity=qty,
            average_buy_price=round(cost / bought, 4),
            current_price=latest(closes[ticker]),
            holding_type=kind,
            sector=sector,
            industry=industry,
            dividend_yield=dy,
            broker=broker,
        )
        db.add(h)
        db.flush()
        holding_ids[ticker] = h.id
        for (d, p), q in buys:
            db.add(
                Transaction(
                    holding_id=h.id,
                    ticker=ticker,
                    transaction_type="buy",
                    quantity=q,
                    price=p,
                    fees=0.0,
                    transaction_date=d,
                    broker=broker,
                )
            )
        for ago, q in sold:
            d, p = price_on(closes[ticker], ago)
            db.add(
                Transaction(
                    holding_id=h.id,
                    ticker=ticker,
                    transaction_type="sell",
                    quantity=q,
                    price=p,
                    fees=0.0,
                    transaction_date=d,
                    broker=broker,
                )
            )

    for t, (name, sector, industry, dy, broker, lots) in STOCKS.items():
        add_holding(
            t,
            "stock",
            name,
            sector,
            industry,
            dy,
            broker,
            lots,
            [(ago, q) for st, ago, q in SELLS if st == t],
        )
    for t, (name, dy, broker, lots) in ETFS.items():
        add_holding(t, "etf", name, "ETF", None, dy, broker, lots, [])

    for t, (buy_ago, qty), sell_ago in CLOSED:
        for kind, ago in (("buy", buy_ago), ("sell", sell_ago)):
            d, p = price_on(closes[t], ago)
            db.add(
                Transaction(
                    holding_id=None,
                    ticker=t,
                    transaction_type=kind,
                    quantity=qty,
                    price=p,
                    fees=0.0,
                    transaction_date=d,
                    broker="Robinhood",
                    notes="Position closed" if kind == "sell" else None,
                )
            )

    # Daily closes feed the Portfolio Growth chart.
    for t in [*STOCKS, *ETFS, *WATCHLIST]:
        for d, c in closes[t].items():
            db.add(
                PriceHistory(
                    ticker=t,
                    close_price=c,
                    open_price=c,
                    high_price=c,
                    low_price=c,
                    date=d,
                )
            )

    for t, (name, sector, target, priority, note) in WATCHLIST.items():
        cur = latest(closes[t])
        db.add(
            WatchlistItem(
                ticker=t,
                company_name=name,
                current_price=cur,
                target_buy_price=round(cur * target, 2),
                priority=priority,
                sector=sector,
                notes=note,
            )
        )

    db.add(CashBalance(balance=12_480.0))

    def opt(
        ticker: str,
        kind: str,
        strike_pct: float,
        premium: float,
        contracts: int,
        open_ago: int,
        days_to_expiry: int,
        status: str,
        close: float | None,
        broker: str,
    ) -> None:
        strike = round(latest(closes[ticker]) * strike_pct / 5) * 5
        opened = TODAY - timedelta(days=open_ago)
        db.add(
            OptionsTrade(
                ticker=ticker,
                trade_type=kind,
                strike_price=strike,
                premium=premium,
                contracts=contracts,
                open_date=opened,
                expiry_date=opened + timedelta(days=days_to_expiry),
                status=status,
                close_price=close,
                broker=broker,
            )
        )

    opt("AAPL", "sell_call", 1.08, 3.10, 1, 12, 30, "open", None, "Schwab")
    opt("AMD", "sell_put", 0.9, 4.25, 2, 9, 35, "open", None, "Robinhood")
    opt("MSFT", "sell_call", 1.06, 5.40, 1, 20, 28, "open", None, "Schwab")
    opt("NVDA", "sell_put", 0.88, 3.80, 2, 75, 30, "closed", 0.95, "Robinhood")
    opt("KO", "sell_call", 1.05, 0.85, 3, 70, 30, "expired_worthless", 0.0, "Merrill")
    opt("GOOGL", "buy_call", 1.05, 4.60, 1, 110, 45, "closed", 7.35, "Schwab")
    opt(
        "DIS", "sell_put", 0.92, 1.90, 2, 140, 30, "expired_worthless", 0.0, "Robinhood"
    )
    opt("XOM", "buy_put", 0.95, 2.20, 1, 95, 40, "closed", 0.60, "Robinhood")

    def acct(
        name: str, inst: str | None, kind: str, bal: float, **extra: object
    ) -> None:
        db.add(
            FinancialAccount(
                name=name, institution=inst, account_type=kind, balance=bal, **extra
            )
        )

    acct("Everyday Checking", "Harbor Bank", "checking", 8_420.0)
    # Real bank names (with made-up balances) so issuer logos can be tried out.
    acct("Total Checking", "Chase", "checking", 1_600.0)
    acct("High-Yield Savings", "Summit Savings", "savings", 32_150.0)
    acct("Primary Residence", None, "real_estate", 545_000.0, notes="Estimated value")
    acct("Family SUV", None, "vehicle", 27_500.0)
    acct(
        "Home Mortgage",
        "Harbor Bank",
        "mortgage",
        386_200.0,
        original_amount=420_000.0,
        apr=6.125,
        payoff_date=date(TODAY.year + 28, 6, 1),
    )
    acct(
        "Auto Loan",
        "Summit Credit Union",
        "loan",
        18_640.0,
        original_amount=36_000.0,
        apr=4.9,
        payoff_date=date(TODAY.year + 2, 9, 1),
    )
    acct(
        "Rewards Card",
        "Harbor Bank",
        "credit_card",
        2_185.0,
        credit_limit=15_000.0,
        apr=22.9,
        due_date=TODAY + timedelta(days=11),
    )
    for name, inst, bal, limit, apr in [
        ("Amex Credit Card", "American Express", 1_240.0, 20_000.0, 24.49),
        ("Capital One Venture X", "Capital One", 860.0, 30_000.0, 21.99),
        ("Chase Freedom", "Chase", 315.0, 8_000.0, 20.49),
        ("Chase Sapphire", "Chase", 1_975.0, 25_000.0, 21.49),
    ]:
        acct(name, inst, "credit_card", bal, credit_limit=limit, apr=apr)

    # Bills and income link to these accounts by ID, like the app's dropdowns do.
    db.flush()
    account_ids = {a.name: a.id for a in db.query(FinancialAccount).all()}

    # Net worth trend: weekly snapshots for 6 months, built from real portfolio prices.
    holdings_qty = {h.ticker: h.quantity for h in db.query(Holding).all()}
    for week in range(26, -1, -1):
        ago = week * 7
        portfolio = sum(
            price_on(closes[t], ago)[1] * q for t, q in holdings_qty.items()
        )
        cash = 38_000 + (26 - week) * 95 + random.uniform(-600, 600)
        assets = portfolio + cash + 545_000 + 27_500 + week * 120
        liabilities = (
            386_200 + week * 520 + 18_640 + week * 300 + random.uniform(1_500, 3_000)
        )
        db.add(
            NetWorthSnapshot(
                date=TODAY - timedelta(days=ago),
                total_assets=round(assets, 2),
                total_liabilities=round(liabilities, 2),
                net_worth=round(assets - liabilities, 2),
            )
        )

    def bill(
        name: str,
        cat: str,
        amount: float,
        freq: str,
        due_in: int,
        paid_from: str,
        autopay: bool,
        notes: str | None = None,
    ) -> None:
        db.add(
            RecurringExpense(
                name=name,
                category=cat,
                amount=amount,
                frequency=freq,
                next_due_date=TODAY + timedelta(days=due_in),
                paid_from_account_id=account_ids[paid_from],
                autopay=autopay,
                notes=notes,
            )
        )

    bill(
        "Mortgage",
        "Housing",
        2_548.0,
        "monthly",
        9,
        "Everyday Checking",
        True,
        "Principal, interest and escrow",
    )
    bill("HOA dues", "Housing", 185.0, "monthly", 13, "Everyday Checking", True)
    bill(
        "Home insurance",
        "Housing",
        1_420.0,
        "annual",
        142,
        "Chase Sapphire",
        False,
        "Renews in March",
    )
    bill(
        "Electricity",
        "Utilities",
        142.0,
        "monthly",
        3,
        "Chase Sapphire",
        True,
        "Average bill",
    )
    bill("Water & sewer", "Utilities", 68.0, "monthly", -2, "Everyday Checking", False)
    bill("Internet", "Utilities", 70.0, "monthly", 6, "Capital One Venture X", True)
    bill(
        "Mobile phone",
        "Utilities",
        115.0,
        "monthly",
        10,
        "Chase Freedom",
        True,
        "Family plan",
    )
    bill(
        "Auto loan payment",
        "Auto loans",
        690.0,
        "monthly",
        11,
        "Total Checking",
        True,
        "Ends 2028",
    )
    bill(
        "Car insurance",
        "Insurance",
        960.0,
        "semiannual",
        88,
        "Capital One Venture X",
        False,
    )
    bill(
        "Term life insurance",
        "Insurance",
        42.0,
        "monthly",
        18,
        "Everyday Checking",
        True,
    )
    bill(
        "Gym membership",
        "Health & fitness",
        45.0,
        "monthly",
        8,
        "Amex Credit Card",
        True,
    )
    bill(
        "Streaming bundle",
        "Subscriptions",
        24.99,
        "monthly",
        5,
        "Amex Credit Card",
        True,
    )
    bill("Cloud storage", "Subscriptions", 2.99, "monthly", 21, "Chase Freedom", True)
    bill(
        "Shopping membership",
        "Subscriptions",
        139.0,
        "annual",
        220,
        "Amex Credit Card",
        True,
    )
    bill(
        "Swim lessons",
        "Kids activities",
        120.0,
        "monthly",
        4,
        "Everyday Checking",
        False,
        "Tue & Thu",
    )
    bill(
        "Dance class",
        "Kids activities",
        95.0,
        "monthly",
        12,
        "Everyday Checking",
        False,
    )
    bill(
        "Daycare",
        "Childcare & education",
        1_350.0,
        "monthly",
        7,
        "Total Checking",
        True,
    )
    bill(
        "529 plan contribution",
        "Savings & investing",
        250.0,
        "monthly",
        22,
        "Everyday Checking",
        True,
    )
    bill(
        "Venture X annual fee",
        "Subscriptions",
        395.0,
        "annual",
        26,
        "Capital One Venture X",
        True,
    )
    bill(
        "Food bank donation",
        "Charity & social service",
        50.0,
        "monthly",
        15,
        "Rewards Card",
        True,
    )

    def income(
        name: str,
        cat: str,
        amount: float,
        freq: str,
        to: str,
        notes: str | None = None,
        **schedule: object,
    ) -> None:
        db.add(
            IncomeSource(
                name=name,
                category=cat,
                amount=amount,
                frequency=freq,
                deposited_to_account_id=account_ids[to],
                notes=notes,
                **schedule,
            )
        )

    # Paydays: the most recent Friday, so every-two-weeks pay lands on Fridays.
    last_friday = TODAY - timedelta(days=(TODAY.weekday() - 4) % 7)

    income(
        "Paycheck - Alex",
        "Salary",
        3_150.0,
        "biweekly",
        "Everyday Checking",
        "Take-home after 401(k)",
        pay_date=last_friday,
    )
    income(
        "Paycheck - Sam",
        "Salary",
        2_480.0,
        "semimonthly",
        "Total Checking",
        pay_day_1=6,
        pay_day_2=22,
    )
    income(
        "Freelance design",
        "Side income",
        650.0,
        "monthly",
        "Everyday Checking",
        "Varies; average",
        pay_date=date(TODAY.year, TODAY.month, 25),
        weekend_rule="after",
    )
    income(
        "Annual bonus",
        "Bonus",
        6_000.0,
        "annual",
        "High-Yield Savings",
        "Paid in March",
        pay_date=date(TODAY.year, 3, 13),
    )
    income(
        "Savings interest",
        "Dividends & interest",
        105.0,
        "monthly",
        "High-Yield Savings",
        pay_date=date(TODAY.year, 1, 31),  # last day of each month
        weekend_rule="none",
    )

    # Earnings calendar: the page reads today's cache row before calling Finnhub,
    # so pre-fill 30 days to keep the demo working without a Finnhub key.
    names = {
        **{t: v[0] for t, v in STOCKS.items()},
        **{t: v[0] for t, v in WATCHLIST.items()},
        "ORCL": "Oracle Corporation",
        "ADBE": "Adobe Inc.",
        "PEP": "PepsiCo, Inc.",
        "WMT": "Walmart Inc.",
        "MCD": "McDonald's Corporation",
        "BA": "The Boeing Company",
        "PFE": "Pfizer Inc.",
        "UBER": "Uber Technologies, Inc.",
    }
    pool = list(names)
    for day in range(30):
        cache_day = TODAY + timedelta(days=day)
        items = []
        for offset in range(3):
            d = cache_day + timedelta(days=offset)
            if d.weekday() >= 5:
                continue
            rng = random.Random(d.toordinal())
            for t in rng.sample(pool, 4):
                items.append(
                    {
                        "ticker": t,
                        "company": names[t],
                        "date": d.isoformat(),
                        "hour": rng.choice(["bmo", "amc"]),
                        "epsEstimate": round(rng.uniform(0.4, 6.5), 2),
                        "revenueEstimate": rng.randint(5, 120) * 1_000_000_000,
                    }
                )
        items.sort(key=lambda i: (i["date"], i["hour"]))
        db.add(
            EarningsCache(
                cache_date=cache_day, data=json.dumps(items), fetched_at=datetime.now()
            )
        )

    db.commit()


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "finance_demo.db").resolve()
    if "demo" not in target.name:
        raise SystemExit(
            f"Refusing to write to {target.name}: the file name must contain 'demo'."
        )
    if target.exists():
        target.unlink()

    tickers = sorted({*STOCKS, *ETFS, *WATCHLIST, *(t for t, *_ in CLOSED)})
    print(f"Fetching 1 year of prices for {len(tickers)} tickers...")
    closes = fetch_closes(tickers)

    engine = create_engine(f"sqlite:///{target}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed(db, closes)
    print(f"Demo database written to {target}")
    print(f"Run: DATABASE_URL=sqlite:///{target} uvicorn app.main:app --port 8000")


if __name__ == "__main__":
    main()
