"""Open-Meteo forecasts: the request is built here and sent by the browser, and the raw
response it relays back is validated here before any of it is used.

The browser sends the request so that each viewer uses their own Open-Meteo rate limit;
see the module docstring of ``planner.domain.corridor`` for the location budget.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.parse import urlencode

from planner.domain.forecast import HOUR, ForecastWindow, HourlyForecast
from planner.domain.types import LonLat
from planner.errors import InvalidWeatherDataError

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_UNITS = {
    "wind_gusts_10m": "mp/h",
    "wind_speed_10m": "mp/h",
    "rain": "inch",
    "showers": "inch",
    "snowfall": "inch",
}


@dataclass(frozen=True)
class WeatherRequest:
    """A form-encoded POST the browser sends unchanged (a CORS simple request)."""

    url: str
    body: str
    location_count: int


def build_request(locations: Sequence[LonLat], window: ForecastWindow) -> WeatherRequest:
    params = [
        ("latitude", ",".join(f"{lat:.4f}" for _, lat in locations)),
        ("longitude", ",".join(f"{lon:.4f}" for lon, _ in locations)),
        ("hourly", ",".join(HOURLY_UNITS)),
        ("wind_speed_unit", "mph"),
        ("precipitation_unit", "inch"),
        ("timeformat", "unixtime"),
        ("timezone", "GMT"),
        ("start_hour", window.start.strftime("%Y-%m-%dT%H:%M")),
        ("end_hour", window.end.strftime("%Y-%m-%dT%H:%M")),
    ]
    return WeatherRequest(FORECAST_URL, urlencode(params), len(locations))


def parse_relayed(
    payload: Any, expected_locations: int, window: ForecastWindow
) -> tuple[HourlyForecast, ...]:
    """Validate the relayed Open-Meteo response and convert it to hourly forecasts."""
    items = [payload] if expected_locations == 1 and isinstance(payload, dict) else payload
    if not isinstance(items, list) or len(items) != expected_locations:
        raise InvalidWeatherDataError("The forecast does not cover every location of this plan.")
    expected_times = [int((window.start + i * HOUR).timestamp()) for i in range(window.hours)]
    return tuple(_parse_location(item, expected_times) for item in items)


def _parse_location(item: Any, expected_times: list[int]) -> HourlyForecast:
    if not isinstance(item, Mapping):
        raise InvalidWeatherDataError()
    hourly, units = item.get("hourly"), item.get("hourly_units")
    if not isinstance(hourly, Mapping) or not isinstance(units, Mapping):
        raise InvalidWeatherDataError()
    if hourly.get("time") != expected_times:
        raise InvalidWeatherDataError("The forecast hours do not match this plan.")

    series: dict[str, tuple[Decimal | None, ...]] = {}
    for variable, unit in HOURLY_UNITS.items():
        if units.get(variable) != unit:
            raise InvalidWeatherDataError("The forecast uses unexpected units.")
        values = hourly.get(variable)
        if not isinstance(values, list) or len(values) != len(expected_times):
            raise InvalidWeatherDataError()
        series[variable] = tuple(_to_decimal(value) for value in values)

    return HourlyForecast(
        gust_mph=series["wind_gusts_10m"],
        wind_mph=series["wind_speed_10m"],
        rain_in=series["rain"],
        showers_in=series["showers"],
        snowfall_in=series["snowfall"],
    )


def _to_decimal(value: Any) -> Decimal | None:
    """Exact decimal of a JSON number; ``str(float)`` gives back the shortest literal."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise InvalidWeatherDataError("The forecast contains a value that is not a number.")
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidWeatherDataError("The forecast contains a value that is not a number.")
    if value < 0:
        raise InvalidWeatherDataError("The forecast contains a negative value.")
    return Decimal(str(value))
