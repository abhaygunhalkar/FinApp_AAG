"""Repository for NetWorthSnapshot operations."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.net_worth_snapshot import NetWorthSnapshot


class NetWorthSnapshotRepository:

    @staticmethod
    def upsert_today(
        db: Session,
        total_assets: float,
        total_liabilities: float,
        net_worth: float,
    ) -> NetWorthSnapshot:
        today = date.today()
        existing = (
            db.query(NetWorthSnapshot)
            .filter(NetWorthSnapshot.date == today)
            .first()
        )
        if existing:
            existing.total_assets = total_assets
            existing.total_liabilities = total_liabilities
            existing.net_worth = net_worth
            snapshot = existing
        else:
            snapshot = NetWorthSnapshot(
                date=today,
                total_assets=total_assets,
                total_liabilities=total_liabilities,
                net_worth=net_worth,
            )
            db.add(snapshot)
        try:
            db.commit()
            db.refresh(snapshot)
            return snapshot
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def get_all(db: Session) -> list[NetWorthSnapshot]:
        return list(
            db.query(NetWorthSnapshot).order_by(NetWorthSnapshot.date.asc()).all()
        )

    @staticmethod
    def get_recent(db: Session, days: int = 365) -> list[NetWorthSnapshot]:
        cutoff = date.today() - timedelta(days=days)
        return list(
            db.query(NetWorthSnapshot)
            .filter(NetWorthSnapshot.date >= cutoff)
            .order_by(NetWorthSnapshot.date.asc())
            .all()
        )
