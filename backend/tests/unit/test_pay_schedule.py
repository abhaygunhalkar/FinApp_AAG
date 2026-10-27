"""Unit tests for pay dates from an income source's pay schedule."""

from dataclasses import dataclass
from datetime import date

from app.services.pay_schedule import adjust_for_weekend, next_pay_date, pay_dates


@dataclass
class Schedule:
    frequency: str
    pay_date: date | None = None
    pay_day_1: int | None = None
    pay_day_2: int | None = None
    weekend_rule: str = "before"


def test_weekend_rules() -> None:
    sunday = date(2026, 11, 22)
    assert adjust_for_weekend(sunday, "before") == date(2026, 11, 20)  # Friday
    assert adjust_for_weekend(sunday, "after") == date(2026, 11, 23)  # Monday
    assert adjust_for_weekend(sunday, "none") == sunday
    saturday = date(2026, 11, 21)
    assert adjust_for_weekend(saturday, "before") == date(2026, 11, 20)
    assert adjust_for_weekend(saturday, "after") == date(2026, 11, 23)
    friday = date(2026, 11, 6)
    assert adjust_for_weekend(friday, "after") == friday


def test_twice_a_month_on_set_days() -> None:
    s = Schedule("semimonthly", pay_day_1=6, pay_day_2=22)
    # Nov 22 and Dec 6 are Sundays, so they're paid the Friday before.
    assert pay_dates(s, date(2026, 11, 1), date(2026, 12, 7)) == [
        date(2026, 11, 6),
        date(2026, 11, 20),
        date(2026, 12, 4),
    ]


def test_twice_a_month_clamps_to_month_end() -> None:
    s = Schedule("semimonthly", pay_day_1=15, pay_day_2=31, weekend_rule="none")
    assert pay_dates(s, date(2027, 2, 1), date(2027, 2, 28)) == [
        date(2027, 2, 15),
        date(2027, 2, 28),
    ]


def test_every_two_weeks_counts_back_and_forward_from_pay_date() -> None:
    s = Schedule("biweekly", pay_date=date(2026, 11, 6))
    assert pay_dates(s, date(2026, 10, 20), date(2026, 11, 30)) == [
        date(2026, 10, 23),
        date(2026, 11, 6),
        date(2026, 11, 20),
    ]


def test_monthly_last_day_does_not_drift() -> None:
    s = Schedule("monthly", pay_date=date(2027, 1, 31), weekend_rule="none")
    assert pay_dates(s, date(2027, 1, 1), date(2027, 3, 31)) == [
        date(2027, 1, 31),
        date(2027, 2, 28),
        date(2027, 3, 31),
    ]


def test_weekend_shift_can_pull_a_payday_into_the_range() -> None:
    # Sunday Nov 1 is paid Friday Oct 30, which is inside an October range.
    s = Schedule("monthly", pay_date=date(2026, 11, 1))
    assert pay_dates(s, date(2026, 10, 26), date(2026, 10, 31)) == [date(2026, 10, 30)]


def test_next_pay_date() -> None:
    s = Schedule("semimonthly", pay_day_1=6, pay_day_2=22)
    assert next_pay_date(s, date(2026, 11, 7)) == date(2026, 11, 20)
    assert next_pay_date(s, date(2026, 11, 6)) == date(2026, 11, 6)


def test_no_schedule_means_no_dates() -> None:
    assert pay_dates(Schedule("biweekly"), date(2026, 1, 1), date(2026, 12, 31)) == []
    assert next_pay_date(Schedule("semimonthly", pay_day_1=6), date(2026, 1, 1)) is None
