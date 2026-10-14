import time
from typing import Any

import pytest
from rest_framework.test import APIClient

from planner.tests.conftest import FakeRoutingProvider, relayed_weather, trip_request


@pytest.fixture
def planned(api_client: APIClient, fake_provider: FakeRoutingProvider) -> dict[str, Any]:
    response = api_client.post("/api/routes", trip_request(), format="json")
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def assess(api_client: APIClient, plan: dict[str, Any], load_lb: int, weather: Any) -> Any:
    return api_client.post(
        "/api/assess",
        {"plan_token": plan["plan_token"], "load_lb": load_lb, "weather": weather},
        format="json",
    )


def route_locations(plan: dict[str, Any], route_id: str) -> set[int]:
    return {c["location_index"] for c in plan["checkpoints"] if c["route_id"] == route_id}


def test_calm_weather_assesses_every_checkpoint_and_recommends_a_route(
    api_client: APIClient, planned: dict[str, Any]
) -> None:
    response = assess(api_client, planned, 20_000, relayed_weather(planned))

    assert response.status_code == 200
    assert "no-store" in response["Cache-Control"]
    body = response.json()
    assert body["load_lb"] == 20_000
    assert [c["id"] for c in body["checkpoints"]] == [c["id"] for c in planned["checkpoints"]]
    first = body["checkpoints"][0]
    assert first["level"] == "low"
    assert first["complete"] is True
    assert first["weather"] == {
        "gust_mph": 10.0,
        "wind_mph": 5.0,
        "rain_in_hr": 0.0,
        "snow_in_hr": 0.0,
    }
    assert first["levels"] == {"wind": "low", "rain": "low", "snow": "low"}
    assert first["lead_hours"] >= 0

    assert sorted(route["rank"] for route in body["routes"]) == [1, 2, 3]
    recommendation = body["recommendation"]
    assert recommendation["status"] == "clear"
    assert recommendation["decided_by"] == "travel_time"
    assert recommendation["route_id"] == "A"

    heatmap = body["heatmap"]
    assert heatmap["hours"] == 49
    assert len(heatmap["frames"]) == 49
    assert all(len(frame) == len(planned["corridor"]["cells"]) for frame in heatmap["frames"])
    assert set(heatmap["frames"][0]) == {0}


def test_the_load_rules_change_the_recommendation(
    api_client: APIClient, planned: dict[str, Any]
) -> None:
    windy_on_a = route_locations(planned, "A") - route_locations(planned, "B")
    weather = relayed_weather(planned, lambda index: 47.0 if index in windy_on_a else 10.0)

    light = assess(api_client, planned, 30_000, weather).json()
    heavy = assess(api_client, planned, 30_001, weather).json()

    light_a = next(route for route in light["routes"] if route["id"] == "A")
    heavy_a = next(route for route in heavy["routes"] if route["id"] == "A")
    assert light_a["miles"]["severe"] > 0
    assert light_a["has_no_travel"] is False
    assert heavy_a["has_no_travel"] is True
    assert light_a["miles"]["no_travel"] == 0
    assert heavy_a["miles"]["no_travel"] > 0
    assert heavy_a["rank"] == 3
    # The two calm routes are compared with each other; Route A drops to last.
    assert heavy["recommendation"]["route_id"] in {"B", "C"}
    assert heavy["recommendation"]["status"] == "clear"
    load_reason = "Gust 47 mph with 30,001 lb load → No Travel (load rule)"
    assert any(load_reason in c["reasons"] for c in heavy["checkpoints"])


def test_a_tampered_context_is_rejected(api_client: APIClient, planned: dict[str, Any]) -> None:
    tampered = dict(planned, plan_token=planned["plan_token"][:-2] + "xx")

    response = assess(api_client, tampered, 20_000, relayed_weather(planned))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_CONTEXT"


def test_an_expired_context_asks_for_a_new_plan(
    api_client: APIClient, planned: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    real_time = time.time
    monkeypatch.setattr("django.core.signing.time.time", lambda: real_time() + 31 * 60)

    response = assess(api_client, planned, 20_000, relayed_weather(planned))

    assert response.status_code == 410
    assert response.json()["error"]["code"] == "CONTEXT_EXPIRED"


def test_relayed_weather_that_does_not_match_the_plan_is_rejected(
    api_client: APIClient, planned: dict[str, Any]
) -> None:
    response = assess(api_client, planned, 20_000, relayed_weather(planned)[:-1])

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_WEATHER_DATA"


@pytest.mark.parametrize("load_lb", [-1, 80_001, "heavy", 1.5])
def test_load_must_be_a_whole_number_of_pounds_within_range(
    api_client: APIClient, planned: dict[str, Any], load_lb: Any
) -> None:
    response = assess(api_client, planned, load_lb, relayed_weather(planned))

    assert response.status_code == 400
    assert "load_lb" in response.json()["error"]["fields"]
