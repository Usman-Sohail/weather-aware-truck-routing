import json
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from planner.domain.types import LonLat
from planner.providers.routing import Place, RouteOption
from planner.providers.tomtom import parse_routes

FIXTURES = Path(__file__).resolve().parent / "fixtures"
DENVER_TZ = ZoneInfo("America/Denver")


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture(autouse=True)
def _clear_throttle_cache() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


class FakeRoutingProvider:
    """A ``RoutingProvider`` serving recorded TomTom responses."""

    def __init__(self, fixture: str = "tomtom_routes_denver_chicago.json") -> None:
        self.options = parse_routes(load_fixture(fixture))
        self.route_calls: list[datetime | None] = []
        self.error: Exception | None = None

    def find_routes(
        self, origin: LonLat, destination: LonLat, depart_at: datetime | None
    ) -> tuple[RouteOption, ...]:
        self.route_calls.append(depart_at)
        if self.error is not None:
            raise self.error
        return self.options

    def geocode(self, query: str) -> tuple[Place, ...]:
        if self.error is not None:
            raise self.error
        return (Place("Denver, CO, United States", (-104.99202, 39.74001), "US", "America/Denver"),)


@pytest.fixture
def fake_provider(monkeypatch: pytest.MonkeyPatch) -> FakeRoutingProvider:
    provider = FakeRoutingProvider()
    monkeypatch.setattr("planner.views.get_routing_provider", lambda: provider)
    return provider


def tomorrow_morning_local() -> str:
    """A departure tomorrow at 08:00 in Denver, as the form sends it."""
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).astimezone(DENVER_TZ).date()
    return f"{tomorrow:%Y-%m-%d}T08:00"


def trip_request(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "origin": {"name": "Denver, CO, United States", "lat": 39.7392, "lon": -104.9903},
        "destination": {"name": "Chicago, IL, United States", "lat": 41.8781, "lon": -87.6298},
        "departure_local": tomorrow_morning_local(),
        "interval_mi": 25,
    }
    body.update(overrides)
    return body


def relayed_weather(
    plan: dict[str, Any], gust_for_location: Callable[[int], float] = lambda _: 10.0
) -> list[dict[str, Any]]:
    """An Open-Meteo-shaped response for every location of a plan, as the browser relays it."""
    window = plan["forecast_window"]
    start = datetime.fromisoformat(window["start_utc"])
    times = [int((start + timedelta(hours=i)).timestamp()) for i in range(window["hours"])]
    units = {
        "time": "unixtime",
        "wind_gusts_10m": "mp/h",
        "wind_speed_10m": "mp/h",
        "rain": "inch",
        "showers": "inch",
        "snowfall": "inch",
    }
    return [
        {
            "hourly_units": units,
            "hourly": {
                "time": times,
                "wind_gusts_10m": [gust_for_location(index)] * len(times),
                "wind_speed_10m": [5.0] * len(times),
                "rain": [0.0] * len(times),
                "showers": [0.0] * len(times),
                "snowfall": [0.0] * len(times),
            },
        }
        for index in range(plan["weather_request"]["location_count"])
    ]
