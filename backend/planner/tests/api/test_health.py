from rest_framework.test import APIClient


def test_health_reports_ok(api_client: APIClient) -> None:
    response = api_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_not_cacheable(api_client: APIClient) -> None:
    response = api_client.get("/api/health")

    assert "no-store" in response["Cache-Control"]
