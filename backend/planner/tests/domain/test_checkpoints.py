from datetime import UTC, datetime, timedelta

import pytest

from planner.domain.checkpoints import (
    checkpoint_miles,
    forecast_locations,
    hourly_positions,
    mile_shares,
    place_checkpoints,
    snap,
)
from planner.domain.geometry import METERS_PER_MILE, ProgressAnchor, build_profile
from planner.domain.types import Checkpoint, RouteProfile

DEPARTURE = datetime(2026, 10, 16, 14, 0, tzinfo=UTC)


def straight_route(length_mi: float, hours: float) -> RouteProfile:
    """A northbound route along the prime meridian driven at constant speed."""
    length_m = length_mi * METERS_PER_MILE
    end_lat = length_m / 111_195.08
    points = tuple((0.0, end_lat * i / 10) for i in range(11))
    return build_profile(
        points, (ProgressAnchor(0, 0, 0), ProgressAnchor(10, length_m, hours * 3600))
    )


@pytest.mark.parametrize(
    ("length_mi", "interval_mi", "expected"),
    [
        (100, 25, (0, 25, 50, 75, 100)),
        (101, 25, (0, 25, 50, 75, 100, 101)),
        (60, 25, (0, 25, 50, 60)),
        (20, 25, (0, 20)),
        (25, 25, (0, 25)),
        (30, 10, (0, 10, 20, 30)),
        (120, 50, (0, 50, 100, 120)),
    ],
)
def test_checkpoint_miles(length_mi: float, interval_mi: int, expected: tuple[float, ...]) -> None:
    assert checkpoint_miles(length_mi, interval_mi) == expected


def test_a_tiny_final_gap_is_kept() -> None:
    assert checkpoint_miles(100.01, 25) == (0, 25, 50, 75, 100, 100.01)


def test_checkpoint_count_for_a_long_route() -> None:
    assert len(checkpoint_miles(1_000, 10)) == 101


@pytest.mark.parametrize(("length_mi", "interval_mi"), [(0, 25), (-5, 25), (100, 0)])
def test_checkpoint_miles_rejects_invalid_input(length_mi: float, interval_mi: int) -> None:
    with pytest.raises(ValueError):
        checkpoint_miles(length_mi, interval_mi)


def test_mile_shares_are_half_the_distance_to_each_neighbour() -> None:
    assert mile_shares((0, 25, 50, 75, 100)) == (12.5, 25, 25, 25, 12.5)
    assert mile_shares((0, 25, 50, 60)) == (12.5, 25, 17.5, 5)
    assert mile_shares((0, 20)) == (10, 10)


@pytest.mark.parametrize("interval_mi", [10, 25, 50])
def test_mile_shares_always_add_up_to_the_route_length(interval_mi: int) -> None:
    for tenths in range(1, 30_000, 37):
        length_mi = tenths / 10
        shares = mile_shares(checkpoint_miles(length_mi, interval_mi))
        assert sum(shares) == pytest.approx(length_mi, abs=1e-9)


def test_place_checkpoints_along_a_constant_speed_route() -> None:
    profile = straight_route(length_mi=60, hours=1.0)

    checkpoints = place_checkpoints("A", profile, interval_mi=25, departure=DEPARTURE)

    assert [c.seq for c in checkpoints] == [0, 1, 2, 3]
    assert [c.mile for c in checkpoints] == pytest.approx([0, 25, 50, 60])
    assert [c.share_mi for c in checkpoints] == pytest.approx([12.5, 25, 17.5, 5])
    assert {c.route_id for c in checkpoints} == {"A"}
    assert checkpoints[0].eta == DEPARTURE
    assert checkpoints[1].eta == DEPARTURE + timedelta(minutes=25)
    assert checkpoints[3].eta == DEPARTURE + timedelta(hours=1)
    assert checkpoints[3].position == profile.points[-1]
    assert checkpoints[1].position[1] == pytest.approx(profile.points[-1][1] * 25 / 60)


def test_hourly_positions_follow_the_truck_and_end_at_arrival() -> None:
    profile = straight_route(length_mi=150, hours=2.5)

    positions = hourly_positions(profile, hours=48)

    assert len(positions) == 49
    assert positions[0] == profile.points[0]
    assert positions[1] is not None
    assert positions[1][1] == pytest.approx(profile.points[-1][1] * 1 / 2.5)
    assert positions[2] is not None
    assert positions[3:] == (None,) * 46


def test_snap_rounds_to_the_lattice() -> None:
    assert snap((-104.9903, 39.7392)) == (-105.0, 39.75)
    assert snap((-87.6298, 41.8781)) == (-87.65, 41.9)


def test_forecast_locations_are_shared_by_nearby_checkpoints() -> None:
    def checkpoint(route_id: str, seq: int, lon: float, lat: float) -> Checkpoint:
        return Checkpoint(route_id, seq, 0.0, 0.0, (lon, lat), 0.0, DEPARTURE)

    checkpoints = (
        checkpoint("A", 0, -104.99, 39.74),
        checkpoint("A", 1, -104.50, 39.80),
        checkpoint("B", 0, -104.99, 39.74),
        checkpoint("B", 1, -104.01, 39.51),
    )

    locations, indices = forecast_locations(checkpoints)

    assert locations == ((-105.0, 39.75), (-104.5, 39.8), (-104.0, 39.5))
    assert indices == (0, 1, 0, 2)
