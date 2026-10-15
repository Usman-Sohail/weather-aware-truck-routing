import copy
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
import responses

from planner.errors import NoRouteError, ProviderUnavailableError
from planner.providers.http import ProviderHttpClient
from planner.providers.routing import RoutingProvider
from planner.providers.tomtom import (
    TRUCK_GROSS_WEIGHT_KG,
    TomTomClient,
    decode_polyline,
    parse_routes,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
KEY = "test-key"
DENVER = (-104.9903, 39.7392)
CHICAGO = (-87.6298, 41.8781)
ROUTE_URL = (
    "https://api.tomtom.com/routing/1/calculateRoute/"
    "39.739200,-104.990300:41.878100,-87.629800/json"
)


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


def client() -> TomTomClient:
    return TomTomClient(KEY, ProviderHttpClient(backoff_s=0))


def sent_query() -> dict[str, list[str]]:
    url = responses.calls[0].request.url
    assert url is not None
    return parse_qs(urlsplit(url).query)


def test_tomtom_client_implements_the_routing_interface() -> None:
    provider: RoutingProvider = client()

    assert provider is not None


def test_a_key_is_required() -> None:
    with pytest.raises(ValueError):
        TomTomClient("")


@responses.activate
def test_route_request_uses_the_truck_profile() -> None:
    responses.get(ROUTE_URL, json=fixture("tomtom_routes_denver_chicago.json"))

    client().find_routes(DENVER, CHICAGO, depart_at=None)

    query = sent_query()
    assert query["key"] == [KEY]
    assert query["travelMode"] == ["truck"]
    assert query["vehicleCommercial"] == ["true"]
    assert query["vehicleWeight"] == [str(TRUCK_GROSS_WEIGHT_KG)]
    assert query["maxAlternatives"] == ["2"]
    assert query["routeRepresentation"] == ["encodedPolyline"]
    assert query["extendedRouteRepresentation"] == ["distance", "travelTime"]
    assert query["departAt"] == ["now"]


@responses.activate
def test_a_future_departure_is_sent_with_its_offset() -> None:
    responses.get(ROUTE_URL, json=fixture("tomtom_routes_denver_chicago.json"))

    client().find_routes(DENVER, CHICAGO, depart_at=datetime(2026, 10, 16, 14, tzinfo=UTC))

    assert sent_query()["departAt"] == ["2026-10-16T14:00:00+00:00"]


@responses.activate
def test_routes_are_parsed_in_provider_order() -> None:
    payload = fixture("tomtom_routes_denver_chicago.json")
    responses.get(ROUTE_URL, json=payload)

    options = client().find_routes(DENVER, CHICAGO, depart_at=None)

    assert [option.provider_index for option in options] == [0, 1, 2]
    for option, route in zip(options, payload["routes"], strict=True):
        assert option.profile.length_m == route["summary"]["lengthInMeters"]
        assert option.profile.travel_time_s == route["summary"]["travelTimeInSeconds"]
        assert option.profile.points[0] == DENVER
        assert option.profile.points[-1] == CHICAGO


def test_sparse_progress_is_kept_exactly_at_its_points() -> None:
    payload = fixture("tomtom_routes_denver_chicago.json")

    profile = parse_routes(payload)[0].profile

    for entry in payload["routes"][0]["progress"]:
        index = entry["pointIndex"]
        assert profile.distance_m[index] == entry["distanceInMeters"]
        assert profile.elapsed_s[index] == entry["travelTimeInSeconds"]


def test_missing_progress_falls_back_to_the_summary_totals() -> None:
    payload = copy.deepcopy(fixture("tomtom_routes_single.json"))
    del payload["routes"][0]["progress"]

    profile = parse_routes(payload)[0].profile

    assert profile.distance_m[0] == 0
    assert profile.length_m == 106_200
    assert profile.travel_time_s == 4_020


def test_a_route_response_without_routes_means_no_route() -> None:
    with pytest.raises(NoRouteError):
        parse_routes({"formatVersion": "0.0.12", "routes": []})


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.pop("routes"),
        lambda p: p["routes"][0].pop("legs"),
        lambda p: p["routes"][0]["progress"][1].pop("distanceInMeters"),
        lambda p: p["routes"][0]["legs"][0].update(encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq"),
        lambda p: p["routes"][0]["legs"][0].update(encodedPolyline=" not a polyline "),
    ],
)
def test_malformed_route_responses_report_the_service_as_unavailable(
    mutate: Any,
) -> None:
    payload = copy.deepcopy(fixture("tomtom_routes_denver_chicago.json"))
    mutate(payload)

    with pytest.raises(ProviderUnavailableError):
        parse_routes(payload)


@responses.activate
def test_unconnected_points_mean_no_route() -> None:
    responses.get(ROUTE_URL, status=400, json={"detailedError": {"code": "NO_ROUTE_FOUND"}})

    with pytest.raises(NoRouteError):
        client().find_routes(DENVER, CHICAGO, depart_at=None)


@responses.activate
def test_a_rejected_key_reports_the_service_as_unavailable() -> None:
    responses.get(ROUTE_URL, status=403, json={"detailedError": {"code": "Forbidden"}})

    with pytest.raises(ProviderUnavailableError) as raised:
        client().find_routes(DENVER, CHICAGO, depart_at=None)

    assert KEY not in str(raised.value)


@responses.activate
def test_geocode_request_and_parsing() -> None:
    url = "https://api.tomtom.com/search/2/geocode/denver.json"
    responses.get(url, json=fixture("tomtom_geocode_denver.json"))

    places = client().geocode("denver")

    query = sent_query()
    assert query["countrySet"] == ["US,CA"]
    assert query["limit"] == ["5"]
    assert [place.name for place in places] == [
        "Denver, CO, United States",
        "Denver City, TX, United States",
    ]
    assert places[0].position == (-104.99202, 39.74001)
    assert places[0].country_code == "US"
    assert places[0].time_zone == "America/Denver"
    assert places[1].time_zone == "America/Chicago"


@responses.activate
def test_geocode_query_is_url_encoded() -> None:
    responses.get(
        "https://api.tomtom.com/search/2/geocode/St.%20John%27s%2C%20NL.json",
        json={"summary": {}, "results": []},
    )

    assert client().geocode("St. John's, NL") == ()


@responses.activate
def test_a_rejected_geocode_query_has_no_matches() -> None:
    responses.get("https://api.tomtom.com/search/2/geocode/x.json", status=400, json={})

    assert client().geocode("x") == ()


@responses.activate
def test_a_geocode_refusal_reports_the_service_as_unavailable() -> None:
    responses.get("https://api.tomtom.com/search/2/geocode/denver.json", status=403, json={})

    with pytest.raises(ProviderUnavailableError):
        client().geocode("denver")


@responses.activate
def test_a_malformed_geocode_response_reports_the_service_as_unavailable() -> None:
    responses.get("https://api.tomtom.com/search/2/geocode/denver.json", json={"summary": {}})

    with pytest.raises(ProviderUnavailableError):
        client().geocode("denver")


def test_decode_polyline_matches_the_reference_example() -> None:
    # The reference example of the encoded polyline format, in (lon, lat) order.
    points = decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")

    assert points == [(-120.2, 38.5), (-120.95, 40.7), (-126.453, 43.252)]


def test_decode_polyline_respects_the_precision() -> None:
    assert decode_polyline("_p~iF~ps|U", precision=6) == [(-12.02, 3.85)]


@pytest.mark.parametrize("encoded", ["_p~iF~ps|U_ulL", "_p~iF~ps", "_p~iF ~ps|U"])
def test_decode_polyline_rejects_truncated_or_invalid_input(encoded: str) -> None:
    with pytest.raises(ValueError):
        decode_polyline(encoded)


def test_a_recorded_tomtom_response_parses_into_consistent_profiles() -> None:
    payload = fixture("tomtom_routes_real_denver_fort_collins.json")

    options = parse_routes(payload)

    assert len(options) == len(payload["routes"]) == 3
    for option, route in zip(options, payload["routes"], strict=True):
        profile = option.profile
        assert route["progress"][-1]["pointIndex"] == len(profile.points) - 1
        assert profile.length_m == route["summary"]["lengthInMeters"]
        assert profile.travel_time_s == route["summary"]["travelTimeInSeconds"]
        assert list(profile.distance_m) == sorted(profile.distance_m)
        assert list(profile.elapsed_s) == sorted(profile.elapsed_s)
        assert profile.points[0] == pytest.approx((-104.99, 39.74), abs=0.05)
        assert profile.points[-1] == pytest.approx((-105.08, 40.59), abs=0.05)
