import copy
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qs

import pytest

from planner.domain.forecast import ForecastWindow
from planner.errors import InvalidWeatherDataError
from planner.providers.open_meteo import FORECAST_URL, build_request, parse_relayed

WINDOW = ForecastWindow(
    datetime(2026, 10, 16, 15, tzinfo=UTC), datetime(2026, 10, 16, 17, tzinfo=UTC)
)
TIMES = [1_792_162_800, 1_792_166_400, 1_792_170_000]  # 15:00, 16:00, 17:00 UTC


def location(gusts: list[Any] | None = None) -> dict[str, Any]:
    return {
        "latitude": 39.75,
        "longitude": -105.0,
        "hourly_units": {
            "time": "unixtime",
            "wind_gusts_10m": "mp/h",
            "wind_speed_10m": "mp/h",
            "rain": "inch",
            "showers": "inch",
            "snowfall": "inch",
        },
        "hourly": {
            "time": list(TIMES),
            "wind_gusts_10m": gusts if gusts is not None else [9.4, 10.5, 8.9],
            "wind_speed_10m": [4.1, 5.0, 4.4],
            "rain": [0.228, 0.0, None],
            "showers": [0.0, 0.004, 0.0],
            "snowfall": [0.0, 0.0, 0.0],
        },
    }


def test_window_hours_match_the_unix_times_used_in_fixtures() -> None:
    assert [int(datetime.fromtimestamp(t, UTC).hour) for t in TIMES] == [15, 16, 17]


def test_build_request_encodes_every_location_and_the_window() -> None:
    request = build_request([(-104.9903, 39.7392), (-87.6298, 41.8781)], WINDOW)

    assert request.url == FORECAST_URL
    assert request.location_count == 2
    assert parse_qs(request.body) == {
        "latitude": ["39.7392,41.8781"],
        "longitude": ["-104.9903,-87.6298"],
        "hourly": ["wind_gusts_10m,wind_speed_10m,rain,showers,snowfall"],
        "wind_speed_unit": ["mph"],
        "precipitation_unit": ["inch"],
        "timeformat": ["unixtime"],
        "timezone": ["GMT"],
        "start_hour": ["2026-10-16T15:00"],
        "end_hour": ["2026-10-16T17:00"],
    }


def test_parse_relayed_returns_exact_decimals_in_location_order() -> None:
    second = location(gusts=[40.0, 41.5, 47.2])

    forecasts = parse_relayed([location(), second], expected_locations=2, window=WINDOW)

    assert forecasts[0].gust_mph == (Decimal("9.4"), Decimal("10.5"), Decimal("8.9"))
    assert forecasts[0].rain_in == (Decimal("0.228"), Decimal("0.0"), None)
    assert forecasts[0].showers_in[1] == Decimal("0.004")
    assert forecasts[1].gust_mph[2] == Decimal("47.2")


def test_a_single_location_may_be_relayed_as_an_object() -> None:
    forecasts = parse_relayed(location(), expected_locations=1, window=WINDOW)

    assert len(forecasts) == 1


def test_integer_values_are_accepted() -> None:
    forecasts = parse_relayed([location(gusts=[9, 10, 56])], expected_locations=1, window=WINDOW)

    assert forecasts[0].gust_mph == (Decimal(9), Decimal(10), Decimal(56))


def _mutations() -> list[tuple[str, Any]]:
    def drop_hourly(p: dict[str, Any]) -> None:
        del p["hourly"]

    def wrong_unit(p: dict[str, Any]) -> None:
        p["hourly_units"]["wind_gusts_10m"] = "km/h"

    def shifted_times(p: dict[str, Any]) -> None:
        p["hourly"]["time"] = [t + 3600 for t in TIMES]

    def short_series(p: dict[str, Any]) -> None:
        p["hourly"]["snowfall"] = [0.0, 0.0]

    def missing_variable(p: dict[str, Any]) -> None:
        del p["hourly"]["showers"]

    def negative(p: dict[str, Any]) -> None:
        p["hourly"]["rain"][0] = -0.1

    def not_finite(p: dict[str, Any]) -> None:
        p["hourly"]["rain"][0] = float("nan")

    def text_value(p: dict[str, Any]) -> None:
        p["hourly"]["rain"][0] = "0.1"

    def boolean_value(p: dict[str, Any]) -> None:
        p["hourly"]["rain"][0] = True

    return [
        ("no hourly data", drop_hourly),
        ("wrong unit", wrong_unit),
        ("shifted hours", shifted_times),
        ("short series", short_series),
        ("missing variable", missing_variable),
        ("negative value", negative),
        ("NaN", not_finite),
        ("text value", text_value),
        ("boolean value", boolean_value),
    ]


@pytest.mark.parametrize(("name", "mutate"), _mutations(), ids=[m[0] for m in _mutations()])
def test_invalid_relayed_data_is_rejected(name: str, mutate: Any) -> None:
    payload = copy.deepcopy(location())
    mutate(payload)

    with pytest.raises(InvalidWeatherDataError):
        parse_relayed([payload], expected_locations=1, window=WINDOW)


@pytest.mark.parametrize(
    "payload",
    [
        [location()],
        [location(), location(), location()],
        "not a list",
        [42, location()],
        {"error": True, "reason": "Too many requests"},
    ],
)
def test_wrong_shape_or_count_is_rejected(payload: Any) -> None:
    with pytest.raises(InvalidWeatherDataError):
        parse_relayed(payload, expected_locations=2, window=WINDOW)
