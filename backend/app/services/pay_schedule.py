"""When income actually arrives: pay dates from a pay schedule."""

import calendar
from datetime import date, timedelta
from typing import Protocol

from app.services.recurring_expense_service import add_periods

# Paydays moved to a weekday can shift by up to 2 days, so look this far past
# each end of a range for nominal dates that land inside it.
_WEEKEND_SLACK = timedelta(days=3)


class PaySchedule(Protocol):
    """The schedule fields of an income source."""

    frequency: str
    pay_date: date | None
    pay_day_1: int | None
    pay_day_2: int | None
    weekend_rule: str


def adjust_for_weekend(day: date, rule: str) -> date:
    """Move a Saturday/Sunday payday to the Friday before or the Monday after."""
    weekday = day.weekday()  # Monday = 0 ... Sunday = 6
    if weekday < 5 or rule == "none":
        return day
    if rule == "after":
        return day + timedelta(days=7 - weekday)
    return day - timedelta(days=weekday - 4)


def has_schedule(income: PaySchedule) -> bool:
    """Whether enough of the schedule is set to know the pay dates."""
    if income.frequency == "semimonthly":
        return income.pay_day_1 is not None and income.pay_day_2 is not None
    return income.pay_date is not None


def _nominal_dates(income: PaySchedule, start: date, end: date) -> list[date]:
    """Scheduled dates in [start, end] before any weekend adjustment."""
    if income.frequency == "semimonthly":
        days = (income.pay_day_1 or 0, income.pay_day_2 or 0)
        out: list[date] = []
        year, month = start.year, start.month
        while date(year, month, 1) <= end:
            last = calendar.monthrange(year, month)[1]
            out += [date(year, month, min(d, last)) for d in days]
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        return sorted(d for d in out if start <= d <= end)

    anchor = income.pay_date
    if anchor is None:
        return []
    # Step back from the anchor to before the range, then forward through it.
    # Always stepping from the anchor keeps month-end dates from drifting.
    count = 0
    while add_periods(anchor, income.frequency, count) > start:
        count -= 1
    out = []
    while (d := add_periods(anchor, income.frequency, count)) <= end:
        if d >= start:
            out.append(d)
        count += 1
    return out


def pay_dates(income: PaySchedule, start: date, end: date) -> list[date]:
    """Days money arrives between start and end (inclusive), weekends adjusted."""
    if not has_schedule(income):
        return []
    nominal = _nominal_dates(income, start - _WEEKEND_SLACK, end + _WEEKEND_SLACK)
    adjusted = (adjust_for_weekend(d, income.weekend_rule) for d in nominal)
    return sorted({d for d in adjusted if start <= d <= end})


def next_pay_date(income: PaySchedule, today: date) -> date | None:
    """The first payday on or after today, or None without a schedule."""
    upcoming = pay_dates(income, today, today + timedelta(days=366))
    return upcoming[0] if upcoming else None
