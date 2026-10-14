from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from planner.domain.forecast import (
    DepartureError,
    ForecastWindow,
    HourlyForecast,
    forecast_hour_for,
    forecast_window,
    resolve_departure,
    sample_at,
)

DENVER = ZoneInfo("America/Denver")


def utc(
    year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0
) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=UTC)


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2026, 10, 16, 14, 0), utc(2026, 10, 16, 15)),
        (utc(2026, 10, 16, 14, 1), utc(2026, 10, 16, 15)),
        (utc(2026, 10, 16, 14, 30), utc(2026, 10, 16, 15)),
        (utc(2026, 10, 16, 14, 59, 59), utc(2026, 10, 16, 15)),
        (utc(2026, 10, 16, 23, 30), utc(2026, 10, 17, 0)),
    ],
)
def test_forecast_hour_is_the_record_covering_the_moment(
    moment: datetime, expected: datetime
) -> None:
    assert forecast_hour_for(moment) == expected


def test_forecast_hour_converts_local_times_to_utc() -> None:
    departure = datetime(2026, 10, 16, 8, 0, tzinfo=DENVER)  # 14:00 UTC

    # An exact-hour departure uses the hour that starts at departure, never the hour before.
    assert forecast_hour_for(departure) == utc(2026, 10, 16, 15)


def test_window_covers_departure_plus_48_hours_for_short_trips() -> None:
    departure = utc(2026, 10, 16, 14, 20)

    window = forecast_window(departure, departure + timedelta(hours=16), now=departure)

    assert window.start == utc(2026, 10, 16, 15)
    assert window.end == utc(2026, 10, 18, 15)
    assert window.hours == 49


def test_window_extends_to_the_latest_arrival_for_long_trips() -> None:
    departure = utc(2026, 10, 16, 14, 0)
    latest_eta = departure + timedelta(hours=60, minutes=30)

    window = forecast_window(departure, latest_eta, now=departure)

    assert window.end == utc(2026, 10, 19, 3)
    assert window.hours == 61


def test_window_is_clamped_to_the_forecast_horizon() -> None:
    now = utc(2026, 10, 14, 10, 0)
    departure = utc(2026, 10, 21, 12, 0)

    window = forecast_window(departure, utc(2026, 11, 2, 0, 0), now=now)

    assert window.end == utc(2026, 10, 29, 0)


def test_window_index_of() -> None:
    window = ForecastWindow(utc(2026, 10, 16, 15), utc(2026, 10, 16, 18))

    assert window.index_of(utc(2026, 10, 16, 15)) == 0
    assert window.index_of(utc(2026, 10, 16, 18)) == 3
    assert window.index_of(utc(2026, 10, 16, 14)) is None
    assert window.index_of(utc(2026, 10, 16, 19)) is None


def _forecast(hours: int) -> HourlyForecast:
    values = tuple(Decimal(i) for i in range(hours))
    return HourlyForecast(
        gust_mph=values,
        wind_mph=values,
        rain_in=values,
        showers_in=values,
        snowfall_in=values,
    )


def test_sample_at_picks_the_record_covering_the_moment() -> None:
    window = ForecastWindow(utc(2026, 10, 16, 15), utc(2026, 10, 16, 18))

    result = sample_at(_forecast(4), window, utc(2026, 10, 16, 16, 40))

    assert result.forecast_hour == utc(2026, 10, 16, 17)
    assert result.gust_mph == Decimal(2)
    assert result.snowfall_in == Decimal(2)


def test_sample_outside_the_window_is_missing_not_current_weather() -> None:
    window = ForecastWindow(utc(2026, 10, 16, 15), utc(2026, 10, 16, 18))

    result = sample_at(_forecast(4), window, utc(2026, 10, 16, 18, 10))

    assert result.forecast_hour == utc(2026, 10, 16, 19)
    assert (result.gust_mph, result.rain_in, result.snowfall_in) == (None, None, None)


def test_departure_is_interpreted_in_the_origin_time_zone() -> None:
    now = utc(2026, 10, 15, 12, 0)

    departure = resolve_departure(datetime(2026, 10, 16, 8, 0), DENVER, now)

    assert departure == utc(2026, 10, 16, 14, 0)


@pytest.mark.parametrize(
    ("offset", "accepted"),
    [
        (timedelta(minutes=-16), False),
        (timedelta(minutes=-14), True),
        (timedelta(days=7), True),
        (timedelta(days=7, minutes=1), False),
    ],
)
def test_departure_window(offset: timedelta, accepted: bool) -> None:
    now = utc(2026, 10, 15, 12, 0)
    local = (now + offset).astimezone(DENVER).replace(tzinfo=None)

    if accepted:
        assert resolve_departure(local, DENVER, now) == now + offset
    else:
        with pytest.raises(DepartureError):
            resolve_departure(local, DENVER, now)


def test_departure_in_a_daylight_saving_gap_is_rejected() -> None:
    now = utc(2026, 3, 5, 12, 0)

    # Clocks in Denver jump from 02:00 to 03:00 on 8 March 2026.
    with pytest.raises(DepartureError, match="does not exist"):
        resolve_departure(datetime(2026, 3, 8, 2, 30), DENVER, now)


def test_ambiguous_departure_uses_the_first_occurrence() -> None:
    now = utc(2026, 10, 30, 12, 0)

    # 01:30 happens twice in Denver on 1 November 2026; the first is daylight time (UTC-6).
    departure = resolve_departure(datetime(2026, 11, 1, 1, 30), DENVER, now)

    assert departure == utc(2026, 11, 1, 7, 30)


def test_a_trip_crossing_a_daylight_saving_change_keeps_utc_hours_continuous() -> None:
    departure = resolve_departure(datetime(2026, 10, 31, 22, 0), DENVER, utc(2026, 10, 30))

    window = forecast_window(departure, departure + timedelta(hours=10), now=departure)

    assert departure == utc(2026, 11, 1, 4, 0)
    assert window.hours == 49
    assert window.end - window.start == timedelta(hours=48)


def test_window_rejects_a_departure_beyond_the_horizon() -> None:
    departure = utc(2026, 11, 20, 12)

    with pytest.raises(DepartureError):
        forecast_window(departure, departure, now=utc(2026, 10, 15))


def test_resolve_departure_expects_a_local_time() -> None:
    with pytest.raises(ValueError, match="without a time zone"):
        resolve_departure(utc(2026, 10, 16, 8), DENVER, utc(2026, 10, 15))
