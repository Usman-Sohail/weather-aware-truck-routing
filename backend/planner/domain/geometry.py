"""Distances along a route, positions by distance or elapsed time, and line simplification."""

import math
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

from planner.domain.types import LonLat, RouteProfile

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_MILE = 1_609.344

# Lookups slightly beyond the route end (floating-point drift) are clamped to the end.
_DISTANCE_TOLERANCE_M = 0.001


@dataclass(frozen=True)
class ProgressAnchor:
    """Provider-reported distance and travel time from the origin to one polyline point."""

    point_index: int
    distance_m: float
    elapsed_s: float


def haversine_m(a: LonLat, b: LonLat) -> float:
    """Great-circle distance in metres between two (lon, lat) points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def build_profile(points: Sequence[LonLat], anchors: Sequence[ProgressAnchor]) -> RouteProfile:
    """Give every polyline point a distance and travel time from the origin.

    The provider reports distance and time only at some points (always the first and the
    last). Between two such anchors, values are spread in proportion to the haversine
    distance along the polyline, so the profile ends exactly at the provider's totals.
    """
    if len(points) < 2:
        raise ValueError("A route needs at least two points.")
    _validate_anchors(anchors, last_index=len(points) - 1)

    along = [0.0]
    for a, b in pairwise(points):
        along.append(along[-1] + haversine_m(a, b))

    distance = [0.0] * len(points)
    elapsed = [0.0] * len(points)
    for start, end in pairwise(anchors):
        span = along[end.point_index] - along[start.point_index]
        for i in range(start.point_index, end.point_index):
            fraction = (along[i] - along[start.point_index]) / span if span > 0 else 0.0
            distance[i] = start.distance_m + fraction * (end.distance_m - start.distance_m)
            elapsed[i] = start.elapsed_s + fraction * (end.elapsed_s - start.elapsed_s)
    distance[-1] = anchors[-1].distance_m
    elapsed[-1] = anchors[-1].elapsed_s

    return RouteProfile(tuple(points), tuple(distance), tuple(elapsed))


def _validate_anchors(anchors: Sequence[ProgressAnchor], last_index: int) -> None:
    if len(anchors) < 2 or anchors[0].point_index != 0 or anchors[-1].point_index != last_index:
        raise ValueError("Route progress must include the first and the last point.")
    if anchors[0].distance_m != 0 or anchors[0].elapsed_s != 0:
        raise ValueError("Route progress must start at zero distance and time.")
    for a, b in pairwise(anchors):
        if b.point_index <= a.point_index:
            raise ValueError("Route progress points must be in increasing order.")
        if b.distance_m < a.distance_m or b.elapsed_s < a.elapsed_s:
            raise ValueError("Route progress distance and time must not decrease.")


def locate_at_distance(profile: RouteProfile, distance_m: float) -> tuple[LonLat, float]:
    """Position and elapsed travel time at a distance along the route."""
    if distance_m < -_DISTANCE_TOLERANCE_M or distance_m > profile.length_m + _DISTANCE_TOLERANCE_M:
        raise ValueError(f"Distance {distance_m:.1f} m is not on the route.")
    distance_m = min(max(distance_m, 0.0), profile.length_m)
    i, fraction = _segment_at(profile.distance_m, distance_m)
    if fraction is None:
        return profile.points[-1], profile.elapsed_s[-1]
    elapsed = profile.elapsed_s[i] + fraction * (profile.elapsed_s[i + 1] - profile.elapsed_s[i])
    return _interpolate(profile.points[i], profile.points[i + 1], fraction), elapsed


def locate_at_elapsed(profile: RouteProfile, elapsed_s: float) -> LonLat | None:
    """Position after a given travel time, or ``None`` once the truck has arrived."""
    if elapsed_s < 0:
        raise ValueError("Elapsed time cannot be negative.")
    if elapsed_s > profile.travel_time_s:
        return None
    i, fraction = _segment_at(profile.elapsed_s, elapsed_s)
    if fraction is None:
        return profile.points[-1]
    return _interpolate(profile.points[i], profile.points[i + 1], fraction)


def _segment_at(axis: tuple[float, ...], value: float) -> tuple[int, float | None]:
    """Index of the segment containing ``value`` on a non-decreasing axis, and the fraction
    along it. The fraction is ``None`` when ``value`` is the end of the axis."""
    if value <= axis[0]:
        return 0, 0.0
    i = bisect_right(axis, value) - 1
    if i >= len(axis) - 1:
        return len(axis) - 1, None
    start, end = axis[i], axis[i + 1]
    return i, (value - start) / (end - start) if end > start else 0.0


def _interpolate(a: LonLat, b: LonLat, fraction: float) -> LonLat:
    return (a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1]))


def simplify(points: Sequence[LonLat], tolerance_m: float) -> tuple[LonLat, ...]:
    """Douglas-Peucker simplification for display; the endpoints are always kept."""
    if len(points) < 3:
        return tuple(points)

    # Project to metres on a local plane; accurate enough at display tolerances.
    mean_lat = math.radians(sum(lat for _, lat in points) / len(points))
    x_scale = math.radians(1) * math.cos(mean_lat) * EARTH_RADIUS_M
    y_scale = math.radians(1) * EARTH_RADIUS_M
    xs = [lon * x_scale for lon, _ in points]
    ys = [lat * y_scale for _, lat in points]

    tolerance_squared = tolerance_m * tolerance_m
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    pending = [(0, len(points) - 1)]
    while pending:
        start, end = pending.pop()
        farthest, distance_squared = _farthest_from_segment(xs, ys, start, end)
        if distance_squared > tolerance_squared:
            keep[farthest] = True
            pending.extend(((start, farthest), (farthest, end)))

    return tuple(point for point, kept in zip(points, keep, strict=True) if kept)


def _farthest_from_segment(
    xs: list[float], ys: list[float], start: int, end: int
) -> tuple[int, float]:
    """Index of the point between ``start`` and ``end`` farthest from the segment joining
    them, and its squared distance. Inlined arithmetic keeps long routes fast."""
    ax, ay = xs[start], ys[start]
    dx, dy = xs[end] - ax, ys[end] - ay
    length_squared = dx * dx + dy * dy
    farthest, farthest_squared = start, 0.0
    for i in range(start + 1, end):
        px, py = xs[i] - ax, ys[i] - ay
        if length_squared > 0:
            t = min(1.0, max(0.0, (px * dx + py * dy) / length_squared))
            px, py = px - t * dx, py - t * dy
        squared = px * px + py * py
        if squared > farthest_squared:
            farthest, farthest_squared = i, squared
    return farthest, farthest_squared
