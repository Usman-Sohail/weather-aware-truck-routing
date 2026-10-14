"""Matching moments to hourly forecast records, the forecast window, and departure rules.

Forecast records are labelled at the end of the hour they describe: precipitation is the
total for the preceding hour and gusts are its maximum. The record for any moment T is
therefore the one labelled floor_hour(T) + 1 h. The same rule is used for checkpoint
arrival times, heatmap slider frames and truck positions.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from planner.domain.types import WeatherSample

HOUR = timedelta(hours=1)
SLIDER_HOURS = 48
DEPARTURE_GRACE = timedelta(minutes=15)
MAX_DEPARTURE_AHEAD = timedelta(days=7)
FORECAST_HORIZON = timedelta(days=15)


class DepartureError(ValueError):
    """A departure time that cannot be planned."""


def _require_aware(moment: datetime) -> None:
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("Expected a time-zone-aware datetime.")


def floor_hour(moment: datetime) -> datetime:
    _require_aware(moment)
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def forecast_hour_for(moment: datetime) -> datetime:
    """UTC label of the hourly record covering ``moment``."""
    return floor_hour(moment) + HOUR


@dataclass(frozen=True)
class ForecastWindow:
    """Consecutive hourly records labelled ``start`` to ``end`` inclusive, in UTC."""

    start: datetime
    end: datetime

    @property
    def hours(self) -> int:
        return (self.end - self.start) // HOUR + 1

    def index_of(self, hour: datetime) -> int | None:
        if hour < self.start or hour > self.end:
            return None
        return (hour - self.start) // HOUR


@dataclass(frozen=True)
class HourlyForecast:
    """One location's hourly values, aligned with a ``ForecastWindow``."""

    gust_mph: tuple[Decimal | None, ...]
    wind_mph: tuple[Decimal | None, ...]
    rain_in: tuple[Decimal | None, ...]
    showers_in: tuple[Decimal | None, ...]
    snowfall_in: tuple[Decimal | None, ...]

    def __post_init__(self) -> None:
        lengths = {
            len(series)
            for series in (
                self.gust_mph,
                self.wind_mph,
                self.rain_in,
                self.showers_in,
                self.snowfall_in,
            )
        }
        if len(lengths) != 1:
            raise ValueError("Every hourly series must have the same length.")

    @property
    def hours(self) -> int:
        return len(self.gust_mph)


def forecast_window(departure: datetime, latest_eta: datetime, now: datetime) -> ForecastWindow:
    """Hours needed for every arrival and for the 0-48 h slider, within the horizon."""
    for moment in (departure, latest_eta, now):
        _require_aware(moment)
    start = forecast_hour_for(departure)
    end = forecast_hour_for(max(departure + SLIDER_HOURS * HOUR, latest_eta))
    start_of_today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = min(end, start_of_today + FORECAST_HORIZON)
    if end < start:
        raise DepartureError("The departure is beyond the forecast horizon.")
    return ForecastWindow(start, end)


def sample_at(forecast: HourlyForecast, window: ForecastWindow, moment: datetime) -> WeatherSample:
    """Weather for ``moment``; values are missing (never substituted) outside the window."""
    if forecast.hours != window.hours:
        raise ValueError("The hourly forecast does not match the forecast window.")
    hour = forecast_hour_for(moment)
    i = window.index_of(hour)
    if i is None:
        return WeatherSample(hour, None, None, None, None, None)
    return WeatherSample(
        forecast_hour=hour,
        gust_mph=forecast.gust_mph[i],
        wind_mph=forecast.wind_mph[i],
        rain_in=forecast.rain_in[i],
        showers_in=forecast.showers_in[i],
        snowfall_in=forecast.snowfall_in[i],
    )


def resolve_departure(local: datetime, zone: ZoneInfo, now: datetime) -> datetime:
    """Convert a local departure time at the origin to UTC and check it can be planned.

    A local time skipped by a daylight-saving change is rejected; a repeated local time
    uses its first occurrence.
    """
    if local.tzinfo is not None:
        raise ValueError("Expected a local time without a time zone.")
    _require_aware(now)
    aware = local.replace(tzinfo=zone, fold=0)
    departure = aware.astimezone(UTC)
    if departure.astimezone(zone).replace(tzinfo=None) != local:
        raise DepartureError(
            f"{local:%Y-%m-%d %H:%M} does not exist in {zone.key} "
            "because the clocks change at that time."
        )
    if departure < now - DEPARTURE_GRACE:
        raise DepartureError("The departure time is in the past.")
    if departure > now + MAX_DEPARTURE_AHEAD:
        raise DepartureError("The departure must be within the next 7 days.")
    return departure
