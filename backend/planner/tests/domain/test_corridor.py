import math

import pytest

from planner.domain.corridor import (
    IntervalTooFineError,
    TripTooLargeError,
    build_corridor,
    check_checkpoint_budget,
    check_relay_size,
    corridor_budget,
)
from planner.domain.geometry import ProgressAnchor, build_profile, haversine_m
from planner.domain.types import LonLat, RouteProfile


def route(start: LonLat, end: LonLat, segments: int = 50) -> RouteProfile:
    points = tuple(
        (
            start[0] + (end[0] - start[0]) * i / segments,
            start[1] + (end[1] - start[1]) * i / segments,
        )
        for i in range(segments + 1)
    )
    length_m = sum(haversine_m(points[i], points[i + 1]) for i in range(segments))
    return build_profile(points, (ProgressAnchor(0, 0, 0), ProgressAnchor(segments, length_m, 1)))


def test_a_short_trip_uses_the_finest_grid() -> None:
    corridor = build_corridor([route((-105.0, 39.7), (-104.0, 40.5))], max_cells=300)

    assert corridor.step_lat_deg == 0.10
    assert 0 < len(corridor.cells) <= 300


def test_a_long_trip_coarsens_the_grid_to_fit_the_budget() -> None:
    profiles = [
        route((-122.3, 47.6), (-74.0, 40.7)),
        route((-122.3, 47.6), (-80.2, 25.8)),
    ]

    corridor = build_corridor(profiles, max_cells=300)

    assert corridor.step_lat_deg > 0.10
    assert len(corridor.cells) <= 300


def test_the_finest_step_that_fits_is_chosen() -> None:
    profiles = [route((-105.0, 39.7), (-95.0, 41.0))]
    fine = build_corridor(profiles, max_cells=10_000)

    tight = build_corridor(profiles, max_cells=len(fine.cells) - 1)

    assert fine.step_lat_deg == 0.10
    assert tight.step_lat_deg > fine.step_lat_deg
    assert len(tight.cells) < len(fine.cells)


@pytest.mark.parametrize("latitude", [30.0, 50.0])
def test_cells_are_square_on_the_ground(latitude: float) -> None:
    corridor = build_corridor([route((-100.0, latitude), (-99.0, latitude))], max_cells=300)

    mid_latitude = math.radians(latitude)
    assert corridor.step_lon_deg * math.cos(mid_latitude) == pytest.approx(corridor.step_lat_deg)


def test_corridor_surrounds_the_route() -> None:
    corridor = build_corridor([route((-105.0, 39.7), (-104.0, 39.7))], max_cells=300)

    rows = {row for _, row in corridor.cells}
    route_row = math.floor(39.7 / corridor.step_lat_deg)
    assert rows == {route_row - 1, route_row, route_row + 1}


def test_cell_geometry() -> None:
    corridor = build_corridor([route((-105.0, 39.7), (-104.0, 39.7))], max_cells=300)
    column, row = corridor.cells[0]

    west, south = corridor.south_west((column, row))
    assert west == pytest.approx(column * corridor.step_lon_deg)
    assert south == pytest.approx(row * corridor.step_lat_deg)
    assert corridor.center((column, row)) == pytest.approx(
        (west + corridor.step_lon_deg / 2, south + corridor.step_lat_deg / 2)
    )


def test_cells_are_in_a_stable_order() -> None:
    profiles = [route((-105.0, 39.7), (-100.0, 41.0))]

    first = build_corridor(profiles, max_cells=300)

    assert first.cells == tuple(sorted(first.cells, key=lambda cell: (cell[1], cell[0])))
    assert build_corridor(profiles, max_cells=300) == first


def test_corridor_budget_shrinks_as_checkpoint_locations_grow() -> None:
    assert corridor_budget(100) == 300
    assert corridor_budget(700) == 300
    assert corridor_budget(800) == 200
    assert corridor_budget(850) == 150


def test_checkpoint_budget_allows_up_to_850_locations() -> None:
    check_checkpoint_budget(850, interval_mi=10)


@pytest.mark.parametrize(
    ("locations", "interval_mi", "suggested"),
    [(851, 10, 25), (2_200, 10, 50), (900, 25, 50)],
)
def test_too_many_checkpoints_suggests_a_coarser_interval(
    locations: int, interval_mi: int, suggested: int
) -> None:
    with pytest.raises(IntervalTooFineError) as raised:
        check_checkpoint_budget(locations, interval_mi)

    assert raised.value.suggested_interval_mi == suggested


def test_too_many_checkpoints_at_the_coarsest_interval_is_too_large() -> None:
    with pytest.raises(TripTooLargeError):
        check_checkpoint_budget(900, interval_mi=50)


def test_relay_size_guard() -> None:
    check_relay_size(locations=1_000, hours=49)

    with pytest.raises(TripTooLargeError):
        check_relay_size(locations=1_000, hours=90)


def test_approximate_cell_size_in_miles() -> None:
    corridor = build_corridor([route((-105.0, 39.7), (-104.0, 39.7))], max_cells=300)

    assert corridor.approx_cell_mi == pytest.approx(6.9, abs=0.1)


def test_routes_too_spread_out_for_any_grid_are_too_large() -> None:
    with pytest.raises(TripTooLargeError):
        build_corridor([route((-122.3, 47.6), (-74.0, 40.7))], max_cells=5)
