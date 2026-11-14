"""Earnings calendar from Finnhub, cached once per day in earnings_cache."""

import json
import logging
import re
from datetime import date, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories.earnings_cache_repository import EarningsCacheRepository

logger = logging.getLogger(__name__)

LARGE_CAP_REVENUE_THRESHOLD = 500_000_000
VALID_TICKER_PATTERN = re.compile(r"^[A-Z0-9]+$")


def _build_finnhub_url(start_date: date, end_date: date, token: str) -> str:
    query = urlencode(
        {
            "from": start_date.isoformat(),
            "to": end_date.isoformat(),
            "token": token,
        }
    )
    return f"https://finnhub.io/api/v1/calendar/earnings?{query}"


def _is_valid_ticker(symbol: str) -> bool:
    return bool(VALID_TICKER_PATTERN.fullmatch(symbol.upper()))


def _normalize_hour(hour_value: Any) -> str:
    if not isinstance(hour_value, str):
        return "bmo"

    hour = hour_value.strip().lower()
    if hour in {"bmo", "amc"}:
        return hour
    if hour.startswith("b"):
        return "bmo"
    if hour.startswith("a"):
        return "amc"
    return "bmo"


def _is_large_cap(item: dict[str, Any]) -> bool:
    revenue = item.get("revenueEstimate")
    return revenue is None or (
        isinstance(revenue, (int, float)) and revenue >= LARGE_CAP_REVENUE_THRESHOLD
    )


def _extract_company_name(item: dict[str, Any], ticker: str) -> str:
    company = item.get("name") or item.get("company") or item.get("symbol")
    if isinstance(company, str) and company.strip():
        return company.strip()
    return ticker


def _fetch_finnhub_calendar(
    start_date: date, end_date: date, token: str
) -> list[dict[str, Any]]:
    url = _build_finnhub_url(start_date, end_date, token)
    request = Request(url, headers={"User-Agent": "FinAppKiro/1.0"})

    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body)
    except HTTPError as exc:
        logger.error("Finnhub API HTTPError %s: %s", exc.code, exc.reason)
        raise RuntimeError("Finnhub API returned an error") from exc
    except URLError as exc:
        logger.error("Finnhub API URLError: %s", exc)
        raise RuntimeError("Unable to reach Finnhub API") from exc
    except json.JSONDecodeError as exc:
        logger.error("Finnhub API returned invalid JSON: %s", exc)
        raise RuntimeError("Finnhub API returned invalid data") from exc

    records = payload.get("earningsCalendar") or payload.get("calendar") or []
    if not isinstance(records, list):
        raise RuntimeError("Finnhub API returned an unexpected payload")

    results: list[dict[str, Any]] = []
    for item in records:
        if not isinstance(item, dict):
            continue

        symbol = item.get("symbol") or item.get("ticker")
        if not isinstance(symbol, str):
            continue
        symbol = symbol.upper().strip()
        if not _is_valid_ticker(symbol):
            continue
        if not _is_large_cap(item):
            continue

        date_value = item.get("date")
        if not isinstance(date_value, str):
            continue

        try:
            parsed_date = date.fromisoformat(date_value)
        except ValueError:
            continue

        results.append(
            {
                "ticker": symbol,
                "company": _extract_company_name(item, symbol),
                "date": parsed_date.isoformat(),
                "hour": _normalize_hour(item.get("hour") or item.get("time")),
                "epsEstimate": (
                    item.get("epsEstimate")
                    if isinstance(item.get("epsEstimate"), (int, float))
                    else None
                ),
                "revenueEstimate": (
                    item.get("revenueEstimate")
                    if isinstance(item.get("revenueEstimate"), (int, float))
                    else None
                ),
            }
        )

    return results


class EarningsService:

    @staticmethod
    def get_calendar(
        db: Session, api_key: str | None, today: date | None = None
    ) -> list[dict[str, Any]]:
        """Large-cap earnings for today through two days ahead.

        Fetched from Finnhub at most once a day; later calls read the cache.
        Raises HTTPException 500 without an API key and 502 when Finnhub fails.
        """
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="Finnhub API key is not configured. "
                "Set FINNHUB_API_KEY in the backend environment.",
            )

        cache_date = today or date.today()
        cached = EarningsCacheRepository.get_by_cache_date(db, cache_date)
        if cached is not None:
            try:
                items: list[dict[str, Any]] = json.loads(cached.data)
            except json.JSONDecodeError:
                logger.warning(
                    "Earnings cache row %s contains invalid JSON; refreshing.",
                    cached.id,
                )
            else:
                return items

        end_date = cache_date + timedelta(days=2)
        try:
            items = _fetch_finnhub_calendar(cache_date, end_date, api_key)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        items.sort(key=lambda item: (item["date"], item["hour"]))
        EarningsCacheRepository.create(db, cache_date, json.dumps(items))
        return items
