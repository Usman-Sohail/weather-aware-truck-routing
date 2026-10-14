"""TomTom truck routing and geocoding, parsed into provider-independent types."""

import logging
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from urllib.parse import quote

from tzfpy import get_tz

from planner.domain.geometry import ProgressAnchor, build_profile
from planner.domain.types import LonLat, RouteProfile
from planner.errors import NoRouteError, ProviderUnavailableError
from planner.providers.http import ParamValue, ProviderClientError, ProviderHttpClient
from planner.providers.routing import Place, RouteOption

logger = logging.getLogger(__name__)

BASE_URL = "https://api.tomtom.com"

# Routes are planned for the US federal maximum gross vehicle weight (80,000 lb), so they
# are legal for any loaded truck. The entered cargo weight only feeds the load rules.
TRUCK_GROSS_WEIGHT_KG = 36_287
MAX_ALTERNATIVES = 2
GEOCODE_COUNTRIES = "US,CA"
GEOCODE_LIMIT = 5


class TomTomClient:
    """``RoutingProvider`` backed by the TomTom Routing and Geocoding APIs."""

    def __init__(self, api_key: str, http: ProviderHttpClient | None = None) -> None:
        if not api_key:
            raise ValueError("A TomTom API key is required.")
        self._api_key = api_key
        self._http = http or ProviderHttpClient()

    def find_routes(
        self, origin: LonLat, destination: LonLat, depart_at: datetime | None
    ) -> tuple[RouteOption, ...]:
        locations = f"{_lat_lon(origin)}:{_lat_lon(destination)}"
        params: dict[str, ParamValue] = {
            "key": self._api_key,
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": TRUCK_GROSS_WEIGHT_KG,
            "maxAlternatives": MAX_ALTERNATIVES,
            "routeRepresentation": "polyline",
            "extendedRouteRepresentation": ["distance", "travelTime"],
            "departAt": "now" if depart_at is None else depart_at.isoformat(timespec="seconds"),
        }
        try:
            payload = self._http.get_json(
                f"{BASE_URL}/routing/1/calculateRoute/{locations}/json", params
            )
        except ProviderClientError as error:
            # TomTom answers 400 when the points are not connected by the road network.
            if error.status_code == 400:
                raise NoRouteError() from None
            raise ProviderUnavailableError() from None
        return parse_routes(payload)

    def geocode(self, query: str) -> tuple[Place, ...]:
        params: dict[str, ParamValue] = {
            "key": self._api_key,
            "countrySet": GEOCODE_COUNTRIES,
            "limit": GEOCODE_LIMIT,
            "language": "en-US",
        }
        try:
            payload = self._http.get_json(
                f"{BASE_URL}/search/2/geocode/{quote(query, safe='')}.json", params
            )
        except ProviderClientError as error:
            if error.status_code == 400:
                return ()
            raise ProviderUnavailableError() from None
        return parse_places(payload)


def _lat_lon(point: LonLat) -> str:
    lon, lat = point
    return f"{lat:.6f},{lon:.6f}"


def parse_routes(payload: Any) -> tuple[RouteOption, ...]:
    try:
        options = tuple(
            RouteOption(provider_index=index, profile=_parse_profile(route))
            for index, route in enumerate(payload["routes"])
        )
    except (KeyError, TypeError, ValueError) as error:
        logger.warning("Unexpected TomTom route response: %s", type(error).__name__)
        raise ProviderUnavailableError() from None
    if not options:
        raise NoRouteError()
    return options


def _parse_profile(route: Mapping[str, Any]) -> RouteProfile:
    points = [
        (float(point["longitude"]), float(point["latitude"]))
        for leg in route["legs"]
        for point in leg["points"]
    ]
    summary = route["summary"]
    last = len(points) - 1

    anchors = {0: ProgressAnchor(0, 0.0, 0.0)}
    for entry in route.get("progress", []):
        index = int(entry["pointIndex"])
        if index == 0:
            continue
        anchors[index] = ProgressAnchor(
            index, float(entry["distanceInMeters"]), float(entry["travelTimeInSeconds"])
        )
    # Without progress for the last point, the route summary gives the totals.
    anchors.setdefault(
        last,
        ProgressAnchor(
            last, float(summary["lengthInMeters"]), float(summary["travelTimeInSeconds"])
        ),
    )
    return build_profile(points, [anchors[index] for index in sorted(anchors)])


def parse_places(payload: Any) -> tuple[Place, ...]:
    try:
        return tuple(_parse_place(result) for result in payload["results"])
    except (KeyError, TypeError, ValueError) as error:
        logger.warning("Unexpected TomTom geocode response: %s", type(error).__name__)
        raise ProviderUnavailableError() from None


def _parse_place(result: Mapping[str, Any]) -> Place:
    address = result["address"]
    position = result["position"]
    lon, lat = float(position["lon"]), float(position["lat"])
    freeform = address.get("freeformAddress") or address["municipality"]
    country = address.get("country")
    name = f"{freeform}, {country}" if country and country not in freeform else freeform
    return Place(
        name=name,
        position=(lon, lat),
        country_code=address["countryCode"],
        time_zone=get_tz(lon, lat) or "UTC",
    )
