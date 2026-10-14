from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs

import pytest
from rest_framework.test import APIClient

from planner.errors import NoRouteError
from planner.tests.conftest import (
    DENVER_TZ,
    FakeRoutingProvider,
    tomorrow_morning_local,
    trip_request,
)


def plan(api_client: APIClient, **overrides: Any) -> Any:
    return api_client.post("/api/routes", trip_request(**overrides), format="json")


def test_routes_are_returned_with_checkpoints_and_a_weather_request(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    response = plan(api_client)

    assert response.status_code == 200
    assert "no-store" in response["Cache-Control"]
    body = response.json()
    assert [route["id"] for route in body["routes"]] == ["A", "B", "C"]
    assert body["notices"] == []
    assert body["interval_mi"] == 25

    route_a = body["routes"][0]
    assert route_a["length_mi"] == pytest.approx(1_612_345 / 1_609.344, abs=0.1)
    assert route_a["travel_time_s"] == 55_800
    assert len(route_a["hourly_positions"]) == 49
    assert route_a["hourly_positions"][-1] is None
    assert 2 <= len(route_a["geometry"]) <= 11

    checkpoints_a = [c for c in body["checkpoints"] if c["route_id"] == "A"]
    assert [c["seq"] for c in checkpoints_a] == list(range(len(checkpoints_a)))
    assert checkpoints_a[0]["id"] == "A-0"
    assert checkpoints_a[0]["eta_utc"] == body["departure"]["utc"]
    assert checkpoints_a[1]["mile"] == 25
    assert sum(c["share_mi"] for c in checkpoints_a) == pytest.approx(route_a["length_mi"], abs=0.1)


def test_departure_is_read_in_the_origin_time_zone(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    local = tomorrow_morning_local()

    departure = plan(api_client, departure_local=local).json()["departure"]

    expected = datetime.fromisoformat(local).replace(tzinfo=DENVER_TZ).astimezone(UTC)
    assert departure["local"] == local
    assert departure["time_zone"] == "America/Denver"
    assert departure["abbreviation"] in {"MDT", "MST"}
    assert datetime.fromisoformat(departure["utc"]) == expected
    assert fake_provider.route_calls == [expected]


def test_the_weather_request_covers_every_checkpoint_location_and_corridor_cell(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    body = plan(api_client).json()

    request = body["weather_request"]
    corridor = body["corridor"]
    query = parse_qs(request["body"])
    checkpoint_locations = corridor["first_location_index"]
    assert request["url"] == "https://api.open-meteo.com/v1/forecast"
    assert request["location_count"] == checkpoint_locations + len(corridor["cells"])
    assert len(query["latitude"][0].split(",")) == request["location_count"]
    assert max(c["location_index"] for c in body["checkpoints"]) == checkpoint_locations - 1
    assert 0 < len(corridor["cells"]) <= 300
    assert body["forecast_window"]["hours"] == 49
    assert body["plan_token"]


def test_fewer_than_three_routes_adds_a_notice(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = FakeRoutingProvider("tomtom_routes_single.json")
    monkeypatch.setattr("planner.views.get_routing_provider", lambda: provider)

    body = plan(
        api_client,
        destination={"name": "Fort Collins, CO, United States", "lat": 40.5853, "lon": -104.8214},
    ).json()

    assert [route["id"] for route in body["routes"]] == ["A"]
    assert body["notices"] == [
        {"code": "FEWER_ROUTES", "message": "Only 1 distinct route was found for this trip."}
    ]


def test_a_departure_within_the_grace_period_is_routed_from_now(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    ten_minutes_ago = (datetime.now(UTC) - timedelta(minutes=10)).astimezone(DENVER_TZ)

    response = plan(api_client, departure_local=f"{ten_minutes_ago:%Y-%m-%dT%H:%M}")

    assert response.status_code == 200
    assert fake_provider.route_calls == [None]


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"interval_mi": 30}, "interval_mi"),
        ({"departure_local": "16/10/2026 08:00"}, "departure_local"),
        ({"departure_local": "2020-01-01T08:00"}, "departure_local"),
        ({"origin": {"name": "Denver", "lat": 95, "lon": -104.99}}, "origin.lat"),
        ({"origin": {"name": "London", "lat": 51.5, "lon": -0.12}}, "origin.non_field_errors"),
    ],
)
def test_invalid_trips_are_rejected_per_field(
    api_client: APIClient, fake_provider: FakeRoutingProvider, overrides: Any, field: str
) -> None:
    response = plan(api_client, **overrides)

    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]
    assert fake_provider.route_calls == []


def test_a_departure_more_than_seven_days_ahead_is_rejected(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    later = (datetime.now(UTC) + timedelta(days=8)).astimezone(DENVER_TZ)

    response = plan(api_client, departure_local=f"{later:%Y-%m-%dT%H:%M}")

    assert response.status_code == 400
    assert response.json()["error"]["fields"]["departure_local"] == [
        "The departure must be within the next 7 days."
    ]


def test_origin_and_destination_must_differ(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    same = {"name": "Denver", "lat": 39.7392, "lon": -104.9903}

    response = plan(api_client, origin=same, destination=same)

    assert response.status_code == 400
    assert response.json()["error"]["fields"]["non_field_errors"] == [
        "Origin and destination must be different places."
    ]


def test_missing_fields_are_listed(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    response = api_client.post("/api/routes", {}, format="json")

    assert response.status_code == 400
    assert set(response.json()["error"]["fields"]) == {
        "origin",
        "destination",
        "departure_local",
        "interval_mi",
    }


def test_no_route_is_reported(api_client: APIClient, fake_provider: FakeRoutingProvider) -> None:
    fake_provider.error = NoRouteError()

    response = plan(api_client)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_ROUTE"


def test_too_many_checkpoint_locations_suggest_a_coarser_interval(
    api_client: APIClient, fake_provider: FakeRoutingProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("planner.domain.corridor.MAX_CHECKPOINT_LOCATIONS", 100)

    response = plan(api_client, interval_mi=10)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INTERVAL_TOO_FINE"
    assert error["suggested_interval_mi"] in {25, 50}


def test_planning_is_throttled_per_client(
    api_client: APIClient, fake_provider: FakeRoutingProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "rest_framework.throttling.ScopedRateThrottle.THROTTLE_RATES",
        {"plan": "1/min", "assess": "1/min", "geocode": "1/min"},
    )

    assert plan(api_client).status_code == 200
    second = plan(api_client)

    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_oversized_requests_are_rejected_before_parsing(
    api_client: APIClient, fake_provider: FakeRoutingProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("planner.views.ApiView.max_body_bytes", 100)

    response = plan(api_client)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_a_trip_needing_too_much_forecast_data_is_too_large(
    api_client: APIClient, fake_provider: FakeRoutingProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("planner.domain.corridor.MAX_RELAY_BYTES", 1_000)

    response = plan(api_client)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TRIP_TOO_LARGE"
