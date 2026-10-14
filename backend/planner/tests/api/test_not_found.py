from django.test import RequestFactory
from rest_framework.test import APIClient

from planner.errors import server_error_view


def test_unknown_url_returns_json_404(api_client: APIClient) -> None:
    response = api_client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert "no-store" in response["Cache-Control"]


def test_server_error_handler_returns_the_envelope_without_details() -> None:
    response = server_error_view(RequestFactory().get("/api/anything"))

    assert response.status_code == 500
    assert b'"code": "INTERNAL_ERROR"' in response.content
    assert "no-store" in response["Cache-Control"]
