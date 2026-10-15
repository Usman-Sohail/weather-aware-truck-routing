"""HTTP access to external providers: timeouts, one retry, error mapping and key redaction.

Error messages never contain request URLs, and original ``requests`` exceptions are not
chained, because their text includes the full URL and therefore the API key.
"""

import logging
import re
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import requests

from planner.errors import ProviderRateLimitedError, ProviderTimeoutError, ProviderUnavailableError

logger = logging.getLogger(__name__)

ParamValue = str | int | float | Sequence[str]

_SECRET_PARAM = re.compile(r"(key=)[^&\s]+", re.IGNORECASE)


class ProviderClientError(Exception):
    """A 4xx response (other than 429) for the calling provider module to interpret."""

    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self.payload = payload
        super().__init__(f"Provider rejected the request with HTTP {status_code}.")


class _RetryableError(Exception):
    """A transient failure; ``error`` is reported if no retry is left."""

    def __init__(self, error: Exception) -> None:
        self.error = error
        super().__init__(str(error))


def redact(text: str) -> str:
    return _SECRET_PARAM.sub(r"\1REDACTED", text)


class ProviderHttpClient:
    """GET requests returning JSON, retrying once on timeouts, connection errors and 5xx."""

    def __init__(
        self,
        *,
        timeout: tuple[float, float] = (5.0, 15.0),
        retries: int = 1,
        retry_timeouts: bool = True,
        backoff_s: float = 0.5,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._timeout = timeout
        self._retries = retries
        self._retry_timeouts = retry_timeouts
        self._backoff_s = backoff_s
        self._session = session or requests.Session()
        self._sleep = sleep

    def get_json(self, url: str, params: Mapping[str, ParamValue]) -> Any:
        attempt = 0
        while True:
            try:
                return self._get_once(url, params)
            except _RetryableError as failure:
                if attempt >= self._retries:
                    raise failure.error from None
                attempt += 1
                self._sleep(self._backoff_s * attempt)

    def _get_once(self, url: str, params: Mapping[str, ParamValue]) -> Any:
        try:
            response = self._session.get(url, params=params, timeout=self._timeout)
        except requests.Timeout:
            self._log_failure(url, params, "timed out")
            if not self._retry_timeouts:
                raise ProviderTimeoutError() from None
            raise _RetryableError(ProviderTimeoutError()) from None
        except requests.RequestException:
            self._log_failure(url, params, "connection failed")
            raise _RetryableError(ProviderUnavailableError()) from None

        status_code = response.status_code
        if status_code == 429:
            self._log_failure(url, params, "rate limited")
            raise ProviderRateLimitedError()
        if status_code >= 500:
            self._log_failure(url, params, f"HTTP {status_code}")
            raise _RetryableError(ProviderUnavailableError())
        if status_code >= 400:
            self._log_failure(url, params, f"HTTP {status_code}")
            raise ProviderClientError(status_code, _json_or_none(response))

        payload = _json_or_none(response)
        if payload is None:
            self._log_failure(url, params, "returned a response that is not JSON")
            raise ProviderUnavailableError()
        return payload

    def _log_failure(self, url: str, params: Mapping[str, ParamValue], reason: str) -> None:
        prepared = requests.Request("GET", url, params=params).prepare()
        logger.warning("Provider request %s: %s", reason, redact(prepared.url or url))


def _json_or_none(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None
