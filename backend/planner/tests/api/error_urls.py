"""Test-only views that raise each kind of error the API must report."""

from django.urls import path
from rest_framework import exceptions, serializers
from rest_framework.request import Request
from rest_framework.response import Response

from planner.errors import ApiError
from planner.views import ApiView


class TripTooLargeError(ApiError):
    status_code = 422
    code = "TRIP_TOO_LARGE"
    default_message = "This trip is too large to plan."


class _NestedSerializer(serializers.Serializer[dict[str, object]]):
    lat = serializers.FloatField(min_value=-90, max_value=90)


class _BodySerializer(serializers.Serializer[dict[str, object]]):
    load_lb = serializers.IntegerField(min_value=0)
    origin = _NestedSerializer()


class ApiErrorView(ApiView):
    def get(self, request: Request) -> Response:
        raise TripTooLargeError(extra={"suggested_interval_mi": 50})


class ValidationView(ApiView):
    def post(self, request: Request) -> Response:
        serializer = _BodySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class ThrottledView(ApiView):
    def get(self, request: Request) -> Response:
        raise exceptions.Throttled(wait=12.3)


class CrashView(ApiView):
    def get(self, request: Request) -> Response:
        raise RuntimeError("secret internal detail")


urlpatterns = [
    path("api-error", ApiErrorView.as_view()),
    path("validation", ValidationView.as_view()),
    path("throttled", ThrottledView.as_view()),
    path("crash", CrashView.as_view()),
]
