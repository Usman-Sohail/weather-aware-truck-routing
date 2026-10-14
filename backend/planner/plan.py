"""Orchestration of the two planning requests.

``plan_routes`` turns a validated trip into routes, checkpoints, a heatmap corridor and the
exact forecast request for the browser to send. ``assess_trip`` validates the forecast the
browser relays back and returns risk, ranking and heatmap frames. The state between the
two travels in a signed, time-limited context token, so the service stores nothing.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from string import ascii_uppercase
from typing import Any
from zoneinfo import ZoneInfo

from django.core import signing

from planner.domain import corridor as budget
from planner.domain.checkpoints import forecast_locations, hourly_positions, place_checkpoints
from planner.domain.forecast import HOUR, SLIDER_HOURS, ForecastWindow, forecast_window, sample_at
from planner.domain.geometry import METERS_PER_MILE, simplify
from planner.domain.heatmap import heatmap_frames
from planner.domain.risk import assess
from planner.domain.scoring import Recommendation, RouteMetrics, recommend, route_metrics
from planner.domain.types import Assessment, Checkpoint, LonLat, RiskLevel, WeatherSample
from planner.errors import (
    ContextExpiredError,
    IntervalTooFineApiError,
    InvalidContextError,
    TripTooLargeApiError,
)
from planner.providers.open_meteo import build_request, parse_relayed
from planner.providers.routing import RouteOption, RoutingProvider

CONTEXT_SALT = "planner.trip-context.v1"
CONTEXT_MAX_AGE = timedelta(minutes=30)
DISPLAY_TOLERANCE_M = 50
EXPECTED_ROUTES = 3


@dataclass(frozen=True)
class Trip:
    origin: LonLat
    destination: LonLat
    departure: datetime
    departure_local: datetime
    time_zone: ZoneInfo
    interval_mi: int


def plan_routes(trip: Trip, provider: RoutingProvider, now: datetime) -> dict[str, Any]:
    depart_at = trip.departure if trip.departure > now else None
    options = provider.find_routes(trip.origin, trip.destination, depart_at)
    route_ids = {
        option.provider_index: ascii_uppercase[option.provider_index] for option in options
    }

    checkpoints = [
        checkpoint
        for option in options
        for checkpoint in place_checkpoints(
            route_ids[option.provider_index], option.profile, trip.interval_mi, trip.departure
        )
    ]
    locations, location_indices = forecast_locations(checkpoints)
    try:
        budget.check_checkpoint_budget(len(locations), trip.interval_mi)
        corridor = budget.build_corridor(
            [option.profile for option in options], budget.corridor_budget(len(locations))
        )
        window = forecast_window(trip.departure, max(c.eta for c in checkpoints), now)
        cell_centers = [corridor.center(cell) for cell in corridor.cells]
        budget.check_relay_size(len(locations) + len(cell_centers), window.hours)
    except budget.IntervalTooFineError as error:
        raise IntervalTooFineApiError(
            str(error), extra={"suggested_interval_mi": error.suggested_interval_mi}
        ) from None
    except budget.TripTooLargeError as error:
        raise TripTooLargeApiError(str(error)) from None

    weather_request = build_request([*locations, *cell_centers], window)
    context = {
        "departure": _iso(trip.departure),
        "window": [_iso(window.start), _iso(window.end)],
        "locations": weather_request.location_count,
        "first_cell": len(locations),
        "routes": [
            [route_ids[o.provider_index], o.provider_index, o.profile.travel_time_s]
            for o in options
        ],
        "checkpoints": [
            [c.route_id, c.seq, c.share_mi, int(c.eta.timestamp()), index]
            for c, index in zip(checkpoints, location_indices, strict=True)
        ],
    }
    return {
        "departure": _departure_json(trip),
        "interval_mi": trip.interval_mi,
        "routes": [_route_json(route_ids[o.provider_index], o, trip.departure) for o in options],
        "checkpoints": [
            _checkpoint_json(c, index)
            for c, index in zip(checkpoints, location_indices, strict=True)
        ],
        "corridor": {
            "step_lat_deg": corridor.step_lat_deg,
            "step_lon_deg": round(corridor.step_lon_deg, 6),
            "approx_cell_mi": round(corridor.approx_cell_mi),
            "cells": [_point(corridor.south_west(cell)) for cell in corridor.cells],
            "first_location_index": len(locations),
        },
        "forecast_window": {
            "start_utc": _iso(window.start),
            "end_utc": _iso(window.end),
            "hours": window.hours,
        },
        "weather_request": {
            "url": weather_request.url,
            "body": weather_request.body,
            "location_count": weather_request.location_count,
        },
        "notices": _notices(len(options)),
        "plan_token": signing.dumps(context, salt=CONTEXT_SALT, compress=True),
    }


def assess_trip(token: str, load_lb: int, weather: Any, now: datetime) -> dict[str, Any]:
    context = _load_context(token)
    window = ForecastWindow(*(datetime.fromisoformat(value) for value in context["window"]))
    departure = datetime.fromisoformat(context["departure"])
    forecasts = parse_relayed(weather, context["locations"], window)

    assessed: dict[str, list[tuple[float, Assessment]]] = {r[0]: [] for r in context["routes"]}
    checkpoints = []
    for route_id, seq, share_mi, eta_timestamp, location_index in context["checkpoints"]:
        eta = datetime.fromtimestamp(eta_timestamp, UTC)
        sample = sample_at(forecasts[location_index], window, eta)
        assessment = assess(sample, load_lb)
        assessed[route_id].append((share_mi, assessment))
        checkpoints.append(_assessment_json(f"{route_id}-{seq}", sample, assessment, now))

    metrics = [
        route_metrics(route_id, provider_index, travel_time_s, assessed[route_id])
        for route_id, provider_index, travel_time_s in context["routes"]
    ]
    ranked, recommendation = recommend(metrics)
    frames = heatmap_frames(forecasts[context["first_cell"] :], window, departure, load_lb)
    return {
        "load_lb": load_lb,
        "checkpoints": checkpoints,
        "routes": [_metrics_json(m, rank) for rank, m in enumerate(ranked, start=1)],
        "recommendation": _recommendation_json(recommendation),
        "heatmap": {"hours": SLIDER_HOURS + 1, "frames": [list(frame) for frame in frames]},
    }


def _load_context(token: str) -> dict[str, Any]:
    try:
        context: dict[str, Any] = signing.loads(token, salt=CONTEXT_SALT, max_age=CONTEXT_MAX_AGE)
    except signing.SignatureExpired:
        raise ContextExpiredError() from None
    except signing.BadSignature:
        raise InvalidContextError() from None
    return context


def _notices(route_count: int) -> list[dict[str, str]]:
    if route_count >= EXPECTED_ROUTES:
        return []
    noun = "route was" if route_count == 1 else "routes were"
    return [
        {
            "code": "FEWER_ROUTES",
            "message": f"Only {route_count} distinct {noun} found for this trip.",
        }
    ]


def _departure_json(trip: Trip) -> dict[str, Any]:
    local = trip.departure.astimezone(trip.time_zone)
    return {
        "local": trip.departure_local.strftime("%Y-%m-%dT%H:%M"),
        "utc": _iso(trip.departure),
        "time_zone": trip.time_zone.key,
        "utc_offset": local.strftime("%z")[:3] + ":" + local.strftime("%z")[3:],
        "abbreviation": local.tzname(),
    }


def _route_json(route_id: str, option: RouteOption, departure: datetime) -> dict[str, Any]:
    profile = option.profile
    return {
        "id": route_id,
        "provider_index": option.provider_index,
        "geometry": [_point(p) for p in simplify(profile.points, DISPLAY_TOLERANCE_M)],
        "length_mi": round(profile.length_m / METERS_PER_MILE, 1),
        "travel_time_s": round(profile.travel_time_s),
        "arrival_utc": _iso(departure + timedelta(seconds=profile.travel_time_s)),
        "hourly_positions": [
            None if p is None else _point(p) for p in hourly_positions(profile, SLIDER_HOURS)
        ],
    }


def _checkpoint_json(checkpoint: Checkpoint, location_index: int) -> dict[str, Any]:
    lon, lat = _point(checkpoint.position)
    return {
        "id": f"{checkpoint.route_id}-{checkpoint.seq}",
        "route_id": checkpoint.route_id,
        "seq": checkpoint.seq,
        "mile": round(checkpoint.mile, 1),
        "share_mi": round(checkpoint.share_mi, 2),
        "lon": lon,
        "lat": lat,
        "eta_utc": _iso(checkpoint.eta),
        "location_index": location_index,
    }


def _assessment_json(
    checkpoint_id: str, sample: WeatherSample, assessment: Assessment, now: datetime
) -> dict[str, Any]:
    rain = (
        None
        if sample.rain_in is None or sample.showers_in is None
        else sample.rain_in + sample.showers_in
    )
    return {
        "id": checkpoint_id,
        "forecast_hour_utc": _iso(sample.forecast_hour),
        "lead_hours": max(0, (sample.forecast_hour - now) // HOUR),
        "weather": {
            "gust_mph": _number(sample.gust_mph),
            "wind_mph": _number(sample.wind_mph),
            "rain_in_hr": _number(rain),
            "snow_in_hr": _number(sample.snowfall_in),
        },
        "levels": {
            "wind": _level_key(assessment.wind),
            "rain": _level_key(assessment.rain),
            "snow": _level_key(assessment.snow),
        },
        "level": _level_key(assessment.level),
        "complete": assessment.complete,
        "reasons": list(assessment.reasons),
    }


def _metrics_json(metrics: RouteMetrics, rank: int) -> dict[str, Any]:
    return {
        "id": metrics.route_id,
        "rank": rank,
        "miles": dict(metrics.miles),
        "miles_display": {key: metrics.miles_text(key) for key in metrics.miles},
        "avg_risk": _number(metrics.avg_risk),
        "has_no_travel": metrics.has_no_travel,
        "has_unknown": metrics.has_unknown,
        "incomplete": metrics.incomplete,
        "travel_minutes": metrics.travel_minutes,
    }


def _recommendation_json(recommendation: Recommendation) -> dict[str, Any]:
    return {
        "route_id": recommendation.route_id,
        "status": recommendation.status,
        "decided_by": recommendation.decided_by,
        "tied_on": list(recommendation.tied_on),
        "explanation": recommendation.explanation,
    }


def _level_key(level: RiskLevel | None) -> str:
    return "unknown" if level is None else level.key


def _number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _point(point: Sequence[float]) -> list[float]:
    return [round(point[0], 5), round(point[1], 5)]


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
