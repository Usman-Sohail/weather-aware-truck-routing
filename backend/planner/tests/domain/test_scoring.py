import random
from decimal import Decimal

import pytest

from planner.domain.scoring import RouteMetrics, recommend, route_metrics
from planner.domain.types import Assessment, RiskLevel

LOW = RiskLevel.LOW
MODERATE = RiskLevel.MODERATE
HIGH = RiskLevel.HIGH
SEVERE = RiskLevel.SEVERE
NO_TRAVEL = RiskLevel.NO_TRAVEL

Leg = tuple[float, RiskLevel | None, bool]


def assessment(level: RiskLevel | None, complete: bool = True) -> Assessment:
    return Assessment(level, LOW, LOW, level, complete, ())


def metrics(route_id: str, provider_index: int, minutes: float, legs: list[Leg]) -> RouteMetrics:
    checkpoints = [(share, assessment(level, complete)) for share, level, complete in legs]
    return route_metrics(route_id, provider_index, minutes * 60, checkpoints)


def calm(miles: float = 100) -> list[Leg]:
    return [(miles, LOW, True)]


def test_miles_are_summed_per_level() -> None:
    result = metrics(
        "A", 0, 60, [(12.5, LOW, True), (25, HIGH, True), (25, SEVERE, True), (12.5, LOW, True)]
    )

    assert result.miles == {
        "low": 25,
        "moderate": 0,
        "high": 25,
        "severe": 25,
        "no_travel": 0,
        "unknown": 0,
    }
    assert result.avg_risk == Decimal("1.7")
    assert result.travel_minutes == 60
    assert not result.has_no_travel
    assert not result.incomplete


@pytest.mark.parametrize(
    ("moderate_miles", "expected"),
    [(5, Decimal("0.1")), (4, Decimal("0.0")), (15, Decimal("0.2"))],
)
def test_average_risk_is_rounded_half_up_to_one_decimal(
    moderate_miles: float, expected: Decimal
) -> None:
    result = metrics(
        "A", 0, 60, [(100 - moderate_miles, LOW, True), (moderate_miles, MODERATE, True)]
    )

    assert result.avg_risk == expected


def test_miles_are_rounded_half_up_to_whole_miles() -> None:
    result = metrics("A", 0, 60, [(87.5, LOW, True), (12.5, HIGH, True)])

    assert result.miles["high"] == 13
    assert result.miles["low"] == 88


def test_unknown_miles_are_excluded_from_average_risk() -> None:
    result = metrics("A", 0, 60, [(50, HIGH, True), (50, None, False)])

    assert result.miles["unknown"] == 50
    assert result.avg_risk == Decimal("2.0")
    assert result.incomplete


def test_a_route_without_any_forecast_has_no_average_risk() -> None:
    result = metrics("A", 0, 60, [(50, None, False), (50, None, False)])

    assert result.avg_risk is None
    assert not result.has_data


def test_no_travel_is_detected_by_checkpoint_even_on_a_tiny_share() -> None:
    result = metrics("A", 0, 60, [(250, LOW, True), (0.015, NO_TRAVEL, True)])

    assert result.miles["no_travel"] == 0
    assert result.has_no_travel
    assert result.no_travel_checkpoints == 1


def test_fewest_severe_miles_wins_first() -> None:
    a = metrics("A", 0, 300, [(75, LOW, True), (25, SEVERE, True)])
    b = metrics("B", 1, 600, [(50, LOW, True), (50, HIGH, True)])

    ranked, recommendation = recommend([a, b])

    assert [m.route_id for m in ranked] == ["B", "A"]
    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "severe_miles"
    assert recommendation.status == "clear"


def test_fewest_high_miles_wins_when_severe_miles_tie() -> None:
    a = metrics("A", 0, 600, [(63, LOW, True), (37, HIGH, True)])
    b = metrics("B", 1, 900, [(88, LOW, True), (12, HIGH, True)])

    _, recommendation = recommend([a, b])

    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "high_miles"
    assert recommendation.tied_on == (
        "no_data_gate",
        "no_travel_gate",
        "coverage_gate",
        "no_travel_miles",
        "severe_miles",
    )
    assert recommendation.explanation == (
        "Route B has the fewest High miles (12 vs 37). "
        "They tie on No Travel miles (0) and Severe miles (0)."
    )


def test_lowest_average_risk_wins_when_severe_and_high_miles_tie() -> None:
    a = metrics("A", 0, 600, [(60, LOW, True), (40, MODERATE, True)])
    b = metrics("B", 1, 900, [(80, LOW, True), (20, MODERATE, True)])

    _, recommendation = recommend([a, b])

    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "average_risk"
    assert "Route B has the lowest average risk (0.2 vs 0.4 on a 0 to 4 scale)." in (
        recommendation.explanation
    )


def test_shortest_travel_time_wins_when_risk_ties() -> None:
    a = metrics("A", 0, 900, calm())
    b = metrics("B", 1, 880, calm())

    _, recommendation = recommend([a, b])

    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "travel_time"
    assert "Route B is the fastest (14 h 40 min vs 15 h 00 min)." in recommendation.explanation


def test_a_shorter_trip_never_outranks_a_safer_one() -> None:
    risky_but_fast = metrics("A", 0, 300, [(99, LOW, True), (1, SEVERE, True)])
    safe_but_slow = metrics("B", 1, 1_200, calm())

    _, recommendation = recommend([risky_but_fast, safe_but_slow])

    assert recommendation.route_id == "B"


def test_provider_order_breaks_a_complete_tie() -> None:
    a = metrics("A", 0, 600, calm())
    b = metrics("B", 1, 600, calm())

    _, recommendation = recommend([b, a])

    assert recommendation.route_id == "A"
    assert recommendation.decided_by == "provider_order"
    assert "tie on every criterion" in recommendation.explanation


def test_any_no_travel_checkpoint_ranks_a_route_last() -> None:
    tiny_no_travel = metrics("A", 0, 300, [(250, LOW, True), (0.015, NO_TRAVEL, True)])
    severe = metrics("B", 1, 600, [(50, LOW, True), (50, SEVERE, True)])

    _, recommendation = recommend([tiny_no_travel, severe])

    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "no_travel_gate"
    assert recommendation.status == "clear"
    assert "Route A has them at 1 checkpoint" in recommendation.explanation


def test_when_every_route_has_no_travel_the_least_risky_is_never_called_safe() -> None:
    a = metrics("A", 0, 300, [(88, LOW, True), (12, NO_TRAVEL, True)])
    b = metrics("B", 1, 600, [(97, LOW, True), (3, NO_TRAVEL, True)])

    _, recommendation = recommend([a, b])

    assert recommendation.route_id == "B"
    assert recommendation.status == "no_safe_route"
    assert recommendation.decided_by == "no_travel_miles"
    assert "fewest No Travel miles (3 vs 12)" in recommendation.explanation
    assert "safe" not in recommendation.explanation.lower()


def test_a_route_with_missing_forecast_ranks_after_complete_routes() -> None:
    incomplete = metrics("A", 0, 300, [(99, LOW, True), (1, LOW, False)])
    complete = metrics("B", 1, 600, [(50, LOW, True), (50, HIGH, True)])

    _, recommendation = recommend([incomplete, complete])

    assert recommendation.route_id == "B"
    assert recommendation.decided_by == "coverage_gate"
    assert recommendation.status == "clear"


def test_when_every_route_is_incomplete_the_recommendation_is_provisional() -> None:
    a = metrics("A", 0, 300, [(90, LOW, True), (10, LOW, False)])
    b = metrics("B", 1, 600, [(90, HIGH, True), (10, LOW, False)])

    _, recommendation = recommend([a, b])

    assert recommendation.route_id == "A"
    assert recommendation.status == "provisional"
    assert "provisional" in recommendation.explanation


def test_a_route_without_forecast_data_is_never_recommended() -> None:
    no_data = metrics("A", 0, 300, [(100, None, False)])
    severe = metrics("B", 1, 600, [(50, LOW, True), (50, SEVERE, True)])
    no_travel = metrics("C", 2, 600, [(50, LOW, True), (50, NO_TRAVEL, True)])

    ranked, _ = recommend([no_data, severe, no_travel])

    assert [m.route_id for m in ranked] == ["B", "C", "A"]

    _, versus_no_travel = recommend([no_data, no_travel])
    assert versus_no_travel.route_id == "C"
    assert versus_no_travel.decided_by == "no_data_gate"
    assert versus_no_travel.status == "no_safe_route"


def test_no_recommendation_when_no_route_has_forecast_data() -> None:
    a = metrics("A", 0, 300, [(100, None, False)])
    b = metrics("B", 1, 600, [(100, None, False)])

    _, recommendation = recommend([a, b])

    assert recommendation.route_id is None
    assert recommendation.status == "unavailable"
    assert recommendation.decided_by is None


def test_a_single_route_is_recommended_as_the_only_option() -> None:
    _, recommendation = recommend([metrics("A", 0, 600, calm())])

    assert recommendation.route_id == "A"
    assert recommendation.decided_by == "only_route"
    assert recommendation.explanation == "Route A is the only route found for this trip."


def test_ranking_does_not_depend_on_input_order() -> None:
    routes = [
        metrics("A", 0, 600, [(90, LOW, True), (10, HIGH, True)]),
        metrics("B", 1, 500, [(95, LOW, True), (5, HIGH, True)]),
        metrics("C", 2, 700, calm()),
    ]
    expected, _ = recommend(routes)

    for seed in range(10):
        shuffled = routes[:]
        random.Random(seed).shuffle(shuffled)
        ranked, _ = recommend(shuffled)
        assert [m.route_id for m in ranked] == [m.route_id for m in expected] == ["C", "B", "A"]


def test_recommend_requires_at_least_one_route() -> None:
    with pytest.raises(ValueError):
        recommend([])
