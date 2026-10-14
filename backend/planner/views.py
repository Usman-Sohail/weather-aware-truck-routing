from typing import Any

from django.conf import settings
from django.utils import timezone
from django.utils.cache import add_never_cache_headers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from planner.errors import PayloadTooLargeError, ServiceNotConfiguredError
from planner.plan import Trip, assess_trip, plan_routes
from planner.providers.routing import RoutingProvider
from planner.providers.tomtom import TomTomClient
from planner.serializers import (
    AssessRequestSerializer,
    GeocodeQuerySerializer,
    RoutesRequestSerializer,
)

GEOCODE_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400"


def get_routing_provider() -> RoutingProvider:
    if not settings.TOMTOM_API_KEY:
        raise ServiceNotConfiguredError()
    return TomTomClient(settings.TOMTOM_API_KEY)


class ApiView(APIView):
    """Base view: rejects oversized bodies before parsing and makes responses uncacheable
    unless a view sets its own Cache-Control."""

    # The hosting platform caps request bodies at 4.5 MB; the largest relay is about 3.8 MB.
    max_body_bytes = 4_000_000

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        content_length = request.META.get("CONTENT_LENGTH") or "0"
        if content_length.isdigit() and int(content_length) > self.max_body_bytes:
            raise PayloadTooLargeError()
        super().initial(request, *args, **kwargs)

    def finalize_response(
        self, request: Request, response: Response, *args: Any, **kwargs: Any
    ) -> Response:
        response = super().finalize_response(request, response, *args, **kwargs)
        if not response.has_header("Cache-Control"):
            add_never_cache_headers(response)
        return response


class HealthView(ApiView):
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class GeocodeView(ApiView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "geocode"

    def get(self, request: Request) -> Response:
        query = GeocodeQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        places = get_routing_provider().geocode(query.validated_data["q"])
        response = Response(
            {
                "candidates": [
                    {
                        "name": place.name,
                        "lat": place.position[1],
                        "lon": place.position[0],
                        "country_code": place.country_code,
                        "time_zone": place.time_zone,
                    }
                    for place in places
                ]
            }
        )
        response["Cache-Control"] = GEOCODE_CACHE_CONTROL
        return response


class RoutesView(ApiView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "plan"

    def post(self, request: Request) -> Response:
        now = timezone.now()
        serializer = RoutesRequestSerializer(data=request.data, context={"now": now})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        trip = Trip(
            origin=(data["origin"]["lon"], data["origin"]["lat"]),
            destination=(data["destination"]["lon"], data["destination"]["lat"]),
            departure=data["departure"],
            departure_local=data["departure_local"],
            time_zone=data["time_zone"],
            interval_mi=data["interval_mi"],
        )
        return Response(plan_routes(trip, get_routing_provider(), now))


class AssessView(ApiView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "assess"

    def post(self, request: Request) -> Response:
        serializer = AssessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = assess_trip(data["plan_token"], data["load_lb"], data["weather"], timezone.now())
        return Response(result)
