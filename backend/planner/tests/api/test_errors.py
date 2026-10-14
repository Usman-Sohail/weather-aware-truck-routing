import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.urls("planner.tests.api.error_urls")


def test_api_error_uses_envelope_with_extra_fields(api_client: APIClient) -> None:
    response = api_client.get("/api-error")

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "TRIP_TOO_LARGE",
            "message": "This trip is too large to plan.",
            "suggested_interval_mi": 50,
        }
    }
    assert "no-store" in response["Cache-Control"]


def test_validation_error_lists_messages_per_field(api_client: APIClient) -> None:
    response = api_client.post(
        "/validation", {"load_lb": -5, "origin": {"lat": 120}}, format="json"
    )

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert set(error["fields"]) == {"load_lb", "origin.lat"}
    assert error["message"] in error["fields"]["load_lb"] + error["fields"]["origin.lat"]


def test_malformed_json_is_a_validation_error(api_client: APIClient) -> None:
    response = api_client.generic(
        "POST", "/validation", "{not json", content_type="application/json"
    )

    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "VALIDATION_ERROR",
        "message": "The request body is not valid JSON.",
    }


def test_unsupported_method_uses_envelope(api_client: APIClient) -> None:
    response = api_client.delete("/validation")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_throttled_request_reports_retry_after(api_client: APIClient) -> None:
    response = api_client.get("/throttled")

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert response["Retry-After"] == "13"


def test_unexpected_exception_hides_internal_details(api_client: APIClient) -> None:
    response = api_client.get("/crash")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secret internal detail" not in response.content.decode()
    assert "Traceback" not in response.content.decode()
