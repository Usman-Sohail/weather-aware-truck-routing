import pytest

from planner.domain.geometry import (
    ProgressAnchor,
    build_profile,
    haversine_m,
    locate_at_distance,
    locate_at_elapsed,
    simplify,
)
from planner.domain.types import RouteProfile

ONE_DEGREE_M = 111_195.08  # one degree of a great circle with the mean Earth radius


def test_haversine_one_degree_along_a_meridian_and_the_equator() -> None:
    assert haversine_m((0.0, 0.0), (0.0, 1.0)) == pytest.approx(ONE_DEGREE_M, abs=1)
    assert haversine_m((0.0, 0.0), (1.0, 0.0)) == pytest.approx(ONE_DEGREE_M, abs=1)


def test_haversine_between_cities() -> None:
    denver, chicago = (-104.9903, 39.7392), (-87.6298, 41.8781)

    assert haversine_m(denver, chicago) == pytest.approx(1_475_000, rel=0.005)
    assert haversine_m(denver, chicago) == haversine_m(chicago, denver)
    assert haversine_m(denver, denver) == 0


def test_profile_with_only_endpoint_anchors_spreads_by_haversine_fraction() -> None:
    points = ((0.0, 0.0), (0.0, 1.0), (0.0, 2.0))
    anchors = (ProgressAnchor(0, 0, 0), ProgressAnchor(2, 250_000, 9_000))

    profile = build_profile(points, anchors)

    assert profile.distance_m == pytest.approx((0, 125_000, 250_000))
    assert profile.elapsed_s == pytest.approx((0, 4_500, 9_000))


def test_profile_with_interior_anchors_interpolates_between_them() -> None:
    points = tuple((0.0, float(i)) for i in range(5))
    anchors = (
        ProgressAnchor(0, 0, 0),
        ProgressAnchor(2, 200_000, 1_000),
        ProgressAnchor(4, 400_000, 4_000),
    )

    profile = build_profile(points, anchors)

    assert profile.elapsed_s == pytest.approx((0, 500, 1_000, 2_500, 4_000))
    assert profile.distance_m == pytest.approx((0, 100_000, 200_000, 300_000, 400_000))


def test_profile_ends_exactly_at_the_provider_length_and_time() -> None:
    points = ((-105.0, 39.7), (-104.0, 39.9), (-100.0, 40.5), (-87.6, 41.9))
    anchors = (ProgressAnchor(0, 0, 0), ProgressAnchor(3, 1_612_345.0, 54_321.0))

    profile = build_profile(points, anchors)

    assert profile.length_m == 1_612_345.0
    assert profile.travel_time_s == 54_321.0


def test_profile_handles_repeated_points() -> None:
    points = ((0.0, 0.0), (0.0, 1.0), (0.0, 1.0), (0.0, 2.0))
    anchors = (ProgressAnchor(0, 0, 0), ProgressAnchor(3, 200_000, 2_000))

    profile = build_profile(points, anchors)

    assert profile.distance_m == pytest.approx((0, 100_000, 100_000, 200_000))


@pytest.mark.parametrize(
    "anchors",
    [
        (ProgressAnchor(0, 0, 0),),
        (ProgressAnchor(1, 0, 0), ProgressAnchor(2, 10, 10)),
        (ProgressAnchor(0, 0, 0), ProgressAnchor(1, 10, 10)),
        (ProgressAnchor(0, 0, 0), ProgressAnchor(2, 10, 10), ProgressAnchor(1, 5, 5)),
        (
            ProgressAnchor(0, 0, 0),
            ProgressAnchor(2, 10, 10),
            ProgressAnchor(1, 12, 12),
            ProgressAnchor(2, 20, 20),
        ),
        (ProgressAnchor(0, 0, 0), ProgressAnchor(1, 10, 10), ProgressAnchor(2, 5, 20)),
        (ProgressAnchor(0, 5, 0), ProgressAnchor(2, 10, 10)),
    ],
)
def test_profile_rejects_invalid_progress(anchors: tuple[ProgressAnchor, ...]) -> None:
    points = ((0.0, 0.0), (0.0, 1.0), (0.0, 2.0))

    with pytest.raises(ValueError):
        build_profile(points, anchors)


def test_profile_rejects_a_single_point() -> None:
    with pytest.raises(ValueError):
        build_profile(((0.0, 0.0),), (ProgressAnchor(0, 0, 0),))


@pytest.fixture
def straight_profile() -> RouteProfile:
    points = ((0.0, 0.0), (0.0, 1.0), (0.0, 2.0))
    return build_profile(points, (ProgressAnchor(0, 0, 0), ProgressAnchor(2, 200_000, 7_200)))


def test_locate_at_distance(straight_profile: RouteProfile) -> None:
    assert locate_at_distance(straight_profile, 0) == ((0.0, 0.0), 0.0)
    assert locate_at_distance(straight_profile, 200_000) == ((0.0, 2.0), 7_200.0)

    position, elapsed = locate_at_distance(straight_profile, 50_000)
    assert position == pytest.approx((0.0, 0.5))
    assert elapsed == pytest.approx(1_800)


def test_locate_at_distance_rejects_points_off_the_route(straight_profile: RouteProfile) -> None:
    with pytest.raises(ValueError):
        locate_at_distance(straight_profile, 200_001)
    with pytest.raises(ValueError):
        locate_at_distance(straight_profile, -1)


def test_locate_at_elapsed(straight_profile: RouteProfile) -> None:
    assert locate_at_elapsed(straight_profile, 0) == (0.0, 0.0)
    assert locate_at_elapsed(straight_profile, 7_200) == (0.0, 2.0)
    assert locate_at_elapsed(straight_profile, 3_600) == pytest.approx((0.0, 1.0))
    assert locate_at_elapsed(straight_profile, 7_201) is None


def test_simplify_drops_collinear_points_and_keeps_endpoints() -> None:
    points = tuple((0.0, i / 10) for i in range(11))

    assert simplify(points, tolerance_m=30) == ((0.0, 0.0), (0.0, 1.0))


def test_simplify_keeps_points_that_deviate_beyond_the_tolerance() -> None:
    points = ((0.0, 0.0), (0.01, 0.5), (0.0, 1.0))  # 0.01 deg of longitude is about 1.1 km

    assert simplify(points, tolerance_m=30) == points
    assert simplify(points, tolerance_m=5_000) == ((0.0, 0.0), (0.0, 1.0))


def test_simplify_leaves_short_lines_unchanged() -> None:
    points = ((0.0, 0.0), (1.0, 1.0))

    assert simplify(points, tolerance_m=30) == points


def test_locate_at_elapsed_rejects_negative_time(straight_profile: RouteProfile) -> None:
    with pytest.raises(ValueError):
        locate_at_elapsed(straight_profile, -1)


def test_simplify_keeps_the_far_point_of_a_loop() -> None:
    loop = ((0.0, 0.0), (0.01, 0.5), (0.0, 0.0))

    assert simplify(loop, tolerance_m=30) == loop
