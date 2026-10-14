"""API error types and the single error envelope used by every failure response.

Every error has the shape ``{"error": {"code", "message", "fields"?, ...}}``.
Unexpected exceptions are logged and reported as ``INTERNAL_ERROR`` without details.
"""

import logging
import math
from typing import Any

from django.http import Http404, HttpRequest, JsonResponse
from django.utils.cache import add_never_cache_headers
from rest_framework import exceptions, status
from rest_framework.response import Response

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "An unexpected error occurred. Please try again."


class ApiError(Exception):
    """An expected failure that is reported to the client with a stable code."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "INTERNAL_ERROR"
    default_message: str = INTERNAL_ERROR_MESSAGE

    def __init__(
        self,
        message: str | None = None,
        *,
        fields: dict[str, list[str]] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.fields = fields
        self.extra = extra or {}
        super().__init__(self.message)


class InvalidContextError(ApiError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "INVALID_CONTEXT"
    default_message = "This plan could not be verified. Please plan the trip again."


class ContextExpiredError(ApiError):
    status_code = status.HTTP_410_GONE
    code = "CONTEXT_EXPIRED"
    default_message = "This plan has expired. Please plan the trip again."


class PayloadTooLargeError(ApiError):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    code = "PAYLOAD_TOO_LARGE"
    default_message = "The request is too large."


class IntervalTooFineApiError(ApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "INTERVAL_TOO_FINE"
    default_message = "This trip needs a larger sampling interval."


class TripTooLargeApiError(ApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "TRIP_TOO_LARGE"
    default_message = "This trip is too large to plan."


class ServiceNotConfiguredError(ApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "SERVICE_NOT_CONFIGURED"
    default_message = "Route planning is not configured on this server."


class NoRouteError(ApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "NO_ROUTE"
    default_message = "No truck route was found between these places."


class InvalidWeatherDataError(ApiError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "INVALID_WEATHER_DATA"
    default_message = "The forecast data could not be read. Please plan the trip again."


class ProviderUnavailableError(ApiError):
    status_code = status.HTTP_502_BAD_GATEWAY
    code = "PROVIDER_ERROR"
    default_message = "The routing service is unavailable right now. Please try again shortly."


class ProviderRateLimitedError(ApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "PROVIDER_RATE_LIMITED"
    default_message = "The routing service is busy. Please wait a minute and try again."


class ProviderTimeoutError(ApiError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "PROVIDER_TIMEOUT"
    default_message = "The routing service took too long to respond. Please try again."


def error_body(
    code: str,
    message: str,
    fields: dict[str, list[str]] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    if extra:
        error.update(extra)
    return {"error": error}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """DRF exception handler that maps every exception to the error envelope."""
    if isinstance(exc, ApiError):
        return Response(error_body(exc.code, exc.message, exc.fields, exc.extra), exc.status_code)

    if isinstance(exc, exceptions.ValidationError):
        fields = _field_messages(exc.detail)
        first_message = next(iter(fields.values()))[0] if fields else "Invalid request."
        return Response(
            error_body("VALIDATION_ERROR", first_message, fields), status.HTTP_400_BAD_REQUEST
        )

    if isinstance(exc, exceptions.ParseError):
        return Response(
            error_body("VALIDATION_ERROR", "The request body is not valid JSON."),
            status.HTTP_400_BAD_REQUEST,
        )

    if isinstance(exc, exceptions.Throttled):
        response = Response(
            error_body("RATE_LIMITED", "Too many requests. Please wait a moment and try again."),
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        # ``wait`` is set by Throttled.__init__ but missing from the type stubs.
        wait: float | None = getattr(exc, "wait", None)
        if wait is not None:
            response["Retry-After"] = str(math.ceil(wait))
        return response

    if isinstance(exc, Http404):
        return Response(
            error_body("NOT_FOUND", "The requested resource was not found."),
            status.HTTP_404_NOT_FOUND,
        )

    if isinstance(exc, exceptions.APIException):
        return Response(error_body(str(exc.default_code).upper(), str(exc.detail)), exc.status_code)

    view = context.get("view")
    logger.exception("Unhandled error in %s", type(view).__name__ if view else "unknown view")
    return Response(
        error_body("INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE),
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _field_messages(detail: Any, prefix: str = "") -> dict[str, list[str]]:
    """Flatten DRF error details into ``{"field" or "parent.child": [messages]}``."""
    if isinstance(detail, dict):
        messages: dict[str, list[str]] = {}
        for key, value in detail.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(value, dict):
                messages.update(_field_messages(value, name))
            else:
                messages[name] = _as_strings(value)
        return messages
    return {prefix or "non_field_errors": _as_strings(detail)}


def _as_strings(value: Any) -> list[str]:
    if isinstance(value, list):
        return [message for item in value for message in _as_strings(item)]
    return [str(value)]


def not_found_view(request: HttpRequest, exception: Exception) -> JsonResponse:
    """Django-level 404 handler for URLs outside any API view."""
    response = JsonResponse(
        error_body("NOT_FOUND", "The requested resource was not found."), status=404
    )
    add_never_cache_headers(response)
    return response


def server_error_view(request: HttpRequest) -> JsonResponse:
    """Django-level 500 handler for errors raised outside DRF views."""
    response = JsonResponse(error_body("INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE), status=500)
    add_never_cache_headers(response)
    return response
