"""Tests for net worth totals and snapshots in FinancialAccountService."""

from datetime import date

from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.repositories.net_worth_snapshot_repository import NetWorthSnapshotRepository
from app.schemas.financial_account import FinancialAccountCreate, FinancialAccountUpdate
from app.services.financial_account_service import FinancialAccountService


def _add_holding(db: Session, ticker: str, quantity: float, price: float) -> None:
    db.add(
        Holding(
            ticker=ticker,
            company_name=ticker,
            quantity=quantity,
            average_buy_price=price,
            current_price=price,
            holding_type="stock",
        )
    )
    db.commit()


def test_summary_includes_portfolio_as_asset(db_session: Session) -> None:
    _add_holding(db_session, "AAPL", 10, 200.0)
    FinancialAccountService.create(
        db_session,
        FinancialAccountCreate(name="Checking", account_type="checking", balance=1000),
    )
    FinancialAccountService.create(
        db_session,
        FinancialAccountCreate(name="Mortgage", account_type="mortgage", balance=2500),
    )

    summary = FinancialAccountService.get_summary(db_session)

    assert summary.portfolio_value == 2000.0
    assert summary.total_assets == 3000.0
    assert summary.total_liabilities == 2500.0
    assert summary.net_worth == 500.0


def test_snapshot_matches_summary(db_session: Session) -> None:
    _add_holding(db_session, "MSFT", 5, 400.0)
    FinancialAccountService.create(
        db_session,
        FinancialAccountCreate(name="Card", account_type="credit_card", balance=300),
    )

    snapshots = NetWorthSnapshotRepository.get_recent(db_session)
    summary = FinancialAccountService.get_summary(db_session)

    assert len(snapshots) == 1
    assert snapshots[0].net_worth == summary.net_worth == 1700.0
    assert snapshots[0].total_assets == summary.total_assets


def test_record_snapshot_tracks_price_changes(db_session: Session) -> None:
    _add_holding(db_session, "VOO", 2, 500.0)
    FinancialAccountService.record_snapshot(db_session)
    holding = db_session.query(Holding).one()
    holding.current_price = 550.0
    db_session.commit()

    FinancialAccountService.record_snapshot(db_session)

    snapshots = NetWorthSnapshotRepository.get_recent(db_session)
    assert len(snapshots) == 1
    assert snapshots[0].net_worth == 1100.0


def test_liability_details_round_trip_and_clear(db_session: Session) -> None:
    created = FinancialAccountService.create(
        db_session,
        FinancialAccountCreate(
            name="Visa",
            account_type="credit_card",
            balance=500,
            credit_limit=5000,
            apr=24.99,
            due_date=date(2026, 11, 5),
        ),
    )
    assert created.credit_limit == 5000
    assert created.apr == 24.99
    assert created.is_linked is False
    assert created.last_synced is not None

    # Fields left out stay as they were; fields sent as null are cleared.
    updated = FinancialAccountService.update(
        db_session, created.id, FinancialAccountUpdate(balance=600, apr=None)
    )
    assert updated.balance == 600
    assert updated.credit_limit == 5000
    assert updated.apr is None


def test_crypto_counts_as_asset(db_session: Session) -> None:
    FinancialAccountService.create(
        db_session,
        FinancialAccountCreate(name="BTC", account_type="crypto", balance=1200),
    )
    assert FinancialAccountService.get_summary(db_session).total_assets == 1200
