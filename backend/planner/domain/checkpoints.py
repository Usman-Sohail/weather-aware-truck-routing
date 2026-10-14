"""Checkpoint placement along a route, mile shares, arrival times and hourly positions."""

from collections.abc import Sequence
from datetime import datetime, timedelta

from planner.domain.geometry import METERS_PER_MILE, locate_at_distance, locate_at_elapsed
from planner.domain.types import Checkpoint, LonLat, RouteProfile

FORECAST_LATTICE_DEG = 0.05
# Interval points closer than this to the destination are the destination itself.
_SAME_MILE_TOLERANCE = 1e-6


def checkpoint_miles(length_mi: float, interval_mi: int) -> tuple[float, ...]:
    """The origin, every whole interval strictly before the end, and the destination."""
    if length_mi <= 0:
        raise ValueError("Route length must be positive.")
    if interval_mi <= 0:
        raise ValueError("Sampling interval must be positive.")
    miles: list[float] = [0]
    k = 1
    while k * interval_mi < length_mi - _SAME_MILE_TOLERANCE:
        miles.append(k * interval_mi)
        k += 1
    miles.append(length_mi)
    return tuple(miles)


def mile_shares(miles: Sequence[float]) -> tuple[float, ...]:
    """Half the distance to each neighbouring checkpoint; the shares add up to the length."""
    shares = []
    for i in range(len(miles)):
        previous = miles[max(i - 1, 0)]
        following = miles[min(i + 1, len(miles) - 1)]
        shares.append((following - previous) / 2)
    return tuple(shares)


def place_checkpoints(
    route_id: str, profile: RouteProfile, interval_mi: int, departure: datetime
) -> tuple[Checkpoint, ...]:
    length_mi = profile.length_m / METERS_PER_MILE
    miles = checkpoint_miles(length_mi, interval_mi)
    checkpoints = []
    for seq, (mile, share) in enumerate(zip(miles, mile_shares(miles), strict=True)):
        is_destination = seq == len(miles) - 1
        distance_m = profile.length_m if is_destination else mile * METERS_PER_MILE
        position, elapsed_s = locate_at_distance(profile, distance_m)
        checkpoints.append(
            Checkpoint(
                route_id=route_id,
                seq=seq,
                mile=mile,
                share_mi=share,
                position=position,
                elapsed_s=elapsed_s,
                eta=departure + timedelta(seconds=elapsed_s),
            )
        )
    return tuple(checkpoints)


def hourly_positions(profile: RouteProfile, hours: int) -> tuple[LonLat | None, ...]:
    """Where the truck is at departure + 0..``hours`` hours; ``None`` after arrival."""
    return tuple(locate_at_elapsed(profile, hour * 3600) for hour in range(hours + 1))


def snap(point: LonLat, step_deg: float = FORECAST_LATTICE_DEG) -> LonLat:
    """Round a position to the forecast lattice so nearby checkpoints share a forecast."""
    lon, lat = point
    # Adding 0.0 turns -0.0 into 0.0, so both serialise identically.
    return (
        round(round(lon / step_deg) * step_deg, 6) + 0.0,
        round(round(lat / step_deg) * step_deg, 6) + 0.0,
    )


def forecast_locations(
    checkpoints: Sequence[Checkpoint],
) -> tuple[tuple[LonLat, ...], tuple[int, ...]]:
    """Unique snapped forecast locations in first-seen order, and each checkpoint's index."""
    index_by_location: dict[LonLat, int] = {}
    indices = []
    for checkpoint in checkpoints:
        location = snap(checkpoint.position)
        indices.append(index_by_location.setdefault(location, len(index_by_location)))
    return tuple(index_by_location), tuple(indices)
