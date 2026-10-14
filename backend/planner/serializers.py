"""Request validation. Field errors become the ``fields`` of the API error envelope."""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from rest_framework import serializers
from tzfpy import get_tz

from planner.domain.corridor import INTERVALS_MI
from planner.domain.forecast import DepartureError, resolve_departure
from planner.domain.geometry import haversine_m

# A generous box around the United States (including Alaska and Hawaii) and Canada.
SUPPORTED_LATITUDES = (18.0, 84.0)
SUPPORTED_LONGITUDES = (-170.0, -50.0)
SAME_PLACE_M = 1_000
MAX_LOAD_LB = 80_000
DEPARTURE_FORMAT = "%Y-%m-%dT%H:%M"


class PlaceSerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField(max_length=200)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        in_latitudes = SUPPORTED_LATITUDES[0] <= attrs["lat"] <= SUPPORTED_LATITUDES[1]
        in_longitudes = SUPPORTED_LONGITUDES[0] <= attrs["lon"] <= SUPPORTED_LONGITUDES[1]
        if not (in_latitudes and in_longitudes):
            raise serializers.ValidationError("Choose a place in the United States or Canada.")
        return attrs


class RoutesRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """A trip to plan. Needs ``now`` (aware datetime) in the serializer context."""

    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_local = serializers.CharField()
    interval_mi = serializers.ChoiceField(choices=INTERVALS_MI)

    def validate_departure_local(self, value: str) -> datetime:
        try:
            return datetime.strptime(value, DEPARTURE_FORMAT)
        except ValueError:
            raise serializers.ValidationError(
                "Enter the departure date and time as YYYY-MM-DDTHH:MM."
            ) from None

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        origin = (attrs["origin"]["lon"], attrs["origin"]["lat"])
        destination = (attrs["destination"]["lon"], attrs["destination"]["lat"])
        if haversine_m(origin, destination) < SAME_PLACE_M:
            raise serializers.ValidationError("Origin and destination must be different places.")

        time_zone = ZoneInfo(get_tz(*origin) or "UTC")
        try:
            departure = resolve_departure(attrs["departure_local"], time_zone, self.context["now"])
        except DepartureError as error:
            raise serializers.ValidationError({"departure_local": [str(error)]}) from None
        return {**attrs, "departure": departure, "time_zone": time_zone}


class AssessRequestSerializer(serializers.Serializer[dict[str, Any]]):
    plan_token = serializers.CharField()
    load_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    # The raw Open-Meteo response relayed by the browser; validated in providers.open_meteo.
    weather = serializers.JSONField()


class GeocodeQuerySerializer(serializers.Serializer[dict[str, Any]]):
    q = serializers.CharField(min_length=3, max_length=120)
