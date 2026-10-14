from rest_framework.test import APIClient

from planner.errors import ProviderRateLimitedError
from planner.providers.tomtom import TomTomClient
from planner.tests.conftest import FakeRoutingProvider
from planner.views import get_routing_provider


def test_geocode_returns_candidates_with_time_zones(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    response = api_client.get("/api/geocode", {"q": "Denver"})

    assert response.status_code == 200
    assert response.json() == {
        "candidates": [
            {
                "name": "Denver, CO, United States",
                "lat": 39.74001,
                "lon": -104.99202,
                "country_code": "US",
                "time_zone": "America/Denver",
            }
        ]
    }


def test_geocode_results_are_cacheable_by_the_cdn(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    response = api_client.get("/api/geocode", {"q": "Denver"})

    assert "s-maxage=86400" in response["Cache-Control"]
    assert "public" in response["Cache-Control"]


def test_geocode_query_must_have_at_least_three_characters(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    response = api_client.get("/api/geocode", {"q": " de "})

    assert response.status_code == 400
    assert set(response.json()["error"]["fields"]) == {"q"}


def test_geocode_reports_provider_failures(
    api_client: APIClient, fake_provider: FakeRoutingProvider
) -> None:
    fake_provider.error = ProviderRateLimitedError()

    response = api_client.get("/api/geocode", {"q": "Denver"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_RATE_LIMITED"


def test_without_a_routing_key_the_service_reports_it_is_not_configured(
    api_client: APIClient, settings: object
) -> None:
    settings.TOMTOM_API_KEY = ""  # type: ignore[attr-defined]

    response = api_client.get("/api/geocode", {"q": "Denver"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_NOT_CONFIGURED"


def test_a_configured_key_uses_the_tomtom_client(settings: object) -> None:
    settings.TOMTOM_API_KEY = "configured-key"  # type: ignore[attr-defined]

    assert isinstance(get_routing_provider(), TomTomClient)
