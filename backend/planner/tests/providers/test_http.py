import logging

import pytest
import requests
import responses

from planner.errors import ProviderRateLimitedError, ProviderTimeoutError, ProviderUnavailableError
from planner.providers.http import ProviderClientError, ProviderHttpClient

URL = "https://api.example.com/route"
SECRET = "secret-api-key-123"


def client() -> ProviderHttpClient:
    return ProviderHttpClient(backoff_s=0)


@responses.activate
def test_returns_json_and_sends_repeated_parameters() -> None:
    responses.get(URL, json={"ok": True})

    result = client().get_json(URL, {"key": SECRET, "mode": ["distance", "travelTime"]})

    assert result == {"ok": True}
    sent = responses.calls[0].request.url
    assert sent is not None
    assert "mode=distance&mode=travelTime" in sent


@responses.activate
def test_retries_once_after_a_server_error() -> None:
    responses.get(URL, status=500)
    responses.get(URL, json={"ok": True})

    assert client().get_json(URL, {}) == {"ok": True}
    assert len(responses.calls) == 2


@responses.activate
def test_repeated_server_errors_report_the_service_as_unavailable() -> None:
    responses.get(URL, status=502)
    responses.get(URL, status=503)

    with pytest.raises(ProviderUnavailableError):
        client().get_json(URL, {})
    assert len(responses.calls) == 2


@responses.activate
def test_rate_limits_are_not_retried() -> None:
    responses.get(URL, status=429)

    with pytest.raises(ProviderRateLimitedError):
        client().get_json(URL, {})
    assert len(responses.calls) == 1


@responses.activate
def test_timeouts_are_retried_then_reported() -> None:
    responses.get(URL, body=requests.exceptions.ReadTimeout())
    responses.get(URL, body=requests.exceptions.ReadTimeout())

    with pytest.raises(ProviderTimeoutError):
        client().get_json(URL, {})
    assert len(responses.calls) == 2


@responses.activate
def test_timeouts_can_be_reported_without_a_retry() -> None:
    responses.get(URL, body=requests.exceptions.ReadTimeout())
    responses.get(URL, json={"ok": True})

    with pytest.raises(ProviderTimeoutError):
        ProviderHttpClient(backoff_s=0, retry_timeouts=False).get_json(URL, {})
    assert len(responses.calls) == 1


@responses.activate
def test_connection_failures_report_the_service_as_unavailable() -> None:
    responses.get(URL, body=requests.exceptions.ConnectionError())
    responses.get(URL, body=requests.exceptions.ConnectionError())

    with pytest.raises(ProviderUnavailableError):
        client().get_json(URL, {})


@responses.activate
def test_client_errors_are_returned_to_the_caller_with_their_payload() -> None:
    responses.get(URL, status=400, json={"detailedError": {"code": "BadRequest"}})

    with pytest.raises(ProviderClientError) as raised:
        client().get_json(URL, {})

    assert raised.value.status_code == 400
    assert raised.value.payload == {"detailedError": {"code": "BadRequest"}}
    assert len(responses.calls) == 1


@responses.activate
def test_malformed_json_reports_the_service_as_unavailable() -> None:
    responses.get(URL, body="<html>not json</html>", status=200)

    with pytest.raises(ProviderUnavailableError):
        client().get_json(URL, {})


@responses.activate
def test_the_api_key_never_appears_in_errors_or_logs(caplog: pytest.LogCaptureFixture) -> None:
    responses.get(URL, body=requests.exceptions.ConnectionError(f"failed for {URL}?key={SECRET}"))
    responses.get(URL, body=requests.exceptions.ConnectionError(f"failed for {URL}?key={SECRET}"))

    with caplog.at_level(logging.WARNING), pytest.raises(ProviderUnavailableError) as raised:
        client().get_json(URL, {"key": SECRET})

    error = raised.value
    assert SECRET not in str(error)
    assert error.__cause__ is None
    assert error.__suppress_context__
    assert caplog.records
    assert all(SECRET not in record.getMessage() for record in caplog.records)
    assert any("key=REDACTED" in record.getMessage() for record in caplog.records)
