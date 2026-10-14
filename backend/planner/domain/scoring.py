"""Route metrics and the route recommendation.

Routes are compared lexicographically, never by a weighted score, so a faster route can
never outrank a safer one. The order is:

1. routes with no forecast data at all are never recommended;
2. routes with any No Travel checkpoint rank after routes without one;
3. routes with a checkpoint that has no forecast rank after routes forecast everywhere
   (a checkpoint missing only some inputs counts at its known lower-bound level instead,
   and makes the recommendation provisional);
4. then fewest No Travel miles, fewest Severe miles, fewest High miles, lowest average
   risk and shortest travel time, as in the brief;
5. the routing provider's order breaks a complete tie.

Values are compared at the precision shown to the user (whole miles, risk to 0.1, whole
minutes), so every explanation can be checked against the numbers on screen.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from planner.domain.types import Assessment, RiskLevel

Status = Literal["clear", "provisional", "no_safe_route", "unavailable"]

UNKNOWN = "unknown"
CRITERIA = (
    "no_data_gate",
    "no_travel_gate",
    "coverage_gate",
    "no_travel_miles",
    "severe_miles",
    "high_miles",
    "average_risk",
    "travel_time",
    "provider_order",
)


@dataclass(frozen=True)
class RouteMetrics:
    """Risk exposure of one route, at displayed precision."""

    route_id: str
    provider_index: int
    miles: Mapping[str, int]
    checkpoints_by_level: Mapping[str, int]
    avg_risk: Decimal | None
    has_data: bool
    has_unknown: bool
    has_no_travel: bool
    no_travel_checkpoints: int
    incomplete: bool
    travel_minutes: int

    @property
    def label(self) -> str:
        return f"Route {self.route_id}"

    def miles_text(self, key: str) -> str:
        """Miles at a level as displayed: "<1" when checkpoints exist but round to 0."""
        return "<1" if self._under_one_mile(key) else str(self.miles[key])

    def miles_rank(self, key: str) -> Decimal:
        """Miles on the displayed scale 0 < "<1" < 1 < 2 ..., used for ranking."""
        return Decimal("0.5") if self._under_one_mile(key) else Decimal(self.miles[key])

    def _under_one_mile(self, key: str) -> bool:
        return self.miles[key] == 0 and self.checkpoints_by_level[key] > 0


@dataclass(frozen=True)
class Recommendation:
    route_id: str | None
    status: Status
    decided_by: str | None
    tied_on: tuple[str, ...]
    explanation: str


def route_metrics(
    route_id: str,
    provider_index: int,
    travel_time_s: float,
    checkpoints: Sequence[tuple[float, Assessment]],
) -> RouteMetrics:
    """Summarise a route from each checkpoint's mile share and assessment."""
    keys = [level.key for level in RiskLevel] + [UNKNOWN]
    miles = dict.fromkeys(keys, Decimal(0))
    counts = dict.fromkeys(keys, 0)
    weighted_risk = Decimal(0)
    known_miles = Decimal(0)
    for share_mi, assessment in checkpoints:
        share = Decimal(str(share_mi))
        key = UNKNOWN if assessment.level is None else assessment.level.key
        miles[key] += share
        counts[key] += 1
        if assessment.level is not None:
            weighted_risk += share * assessment.level
            known_miles += share

    return RouteMetrics(
        route_id=route_id,
        provider_index=provider_index,
        miles={key: int(_round(value, "1")) for key, value in miles.items()},
        checkpoints_by_level=counts,
        avg_risk=_round(weighted_risk / known_miles, "0.1") if known_miles > 0 else None,
        has_data=counts[UNKNOWN] < len(checkpoints),
        has_unknown=counts[UNKNOWN] > 0,
        has_no_travel=counts[RiskLevel.NO_TRAVEL.key] > 0,
        no_travel_checkpoints=counts[RiskLevel.NO_TRAVEL.key],
        incomplete=any(not assessment.complete for _, assessment in checkpoints),
        travel_minutes=int(_round(Decimal(str(travel_time_s)) / 60, "1")),
    )


def _round(value: Decimal, places: str) -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def _ranking_key(
    m: RouteMetrics,
) -> tuple[bool, bool, bool, Decimal, Decimal, Decimal, Decimal, int, int]:
    return (
        not m.has_data,
        m.has_no_travel,
        m.has_unknown,
        m.miles_rank("no_travel"),
        m.miles_rank("severe"),
        m.miles_rank("high"),
        m.avg_risk if m.avg_risk is not None else Decimal("Infinity"),
        m.travel_minutes,
        m.provider_index,
    )


def recommend(routes: Sequence[RouteMetrics]) -> tuple[tuple[RouteMetrics, ...], Recommendation]:
    """Rank routes best first and explain why the best one was chosen."""
    if not routes:
        raise ValueError("At least one route is needed for a recommendation.")
    ranked = tuple(sorted(routes, key=_ranking_key))
    winner = ranked[0]

    if not winner.has_data:
        subject = "this route" if len(ranked) == 1 else "these routes"
        explanation = f"No forecast data is available for {subject}, so none is recommended."
        return ranked, Recommendation(None, "unavailable", None, (), explanation)

    status: Status = (
        "no_safe_route" if winner.has_no_travel else "provisional" if winner.incomplete else "clear"
    )
    if len(ranked) == 1:
        decided_by = "only_route"
        tied_on: tuple[str, ...] = ()
        main = f"{winner.label} is the only route found for this trip."
    else:
        runner_up = ranked[1]
        pairs = zip(_ranking_key(winner), _ranking_key(runner_up), strict=True)
        decided_index = next((i for i, (a, b) in enumerate(pairs) if a != b), len(CRITERIA) - 1)
        decided_by, tied_on = CRITERIA[decided_index], CRITERIA[:decided_index]
        main = _explain_decision(winner, runner_up, decided_by, tied_on)

    sentences = []
    if status == "no_safe_route":
        sentences.append("Every route with forecast data has No Travel conditions along it.")
    sentences.append(main)
    if status == "no_safe_route":
        sentences.append("Consider a different departure time.")
    if winner.incomplete:
        consequence = (
            "so this recommendation is provisional"
            if status == "provisional"
            else "so its exposure may be higher than shown"
        )
        sentences.append(f"Some forecast inputs are missing for {winner.label}, {consequence}.")
    return ranked, Recommendation(winner.route_id, status, decided_by, tied_on, " ".join(sentences))


_MILES_CRITERIA = {
    "no_travel_miles": ("no_travel", "No Travel miles"),
    "severe_miles": ("severe", "Severe miles"),
    "high_miles": ("high", "High miles"),
}


def _explain_decision(
    winner: RouteMetrics, runner_up: RouteMetrics, decided_by: str, tied_on: tuple[str, ...]
) -> str:
    """Explain the winner against the runner-up only, so every claim is a comparison
    between the two routes named in it."""
    w, r = winner.label, runner_up.label
    if decided_by == "no_data_gate":
        return f"{w} is the only route with forecast data."
    if decided_by == "no_travel_gate":
        count = runner_up.no_travel_checkpoints
        plural = "checkpoint" if count == 1 else "checkpoints"
        avoids = "has no known No Travel conditions" if winner.incomplete else "avoids No Travel"
        return f"{w} {avoids}; {r} has No Travel conditions at {count} {plural}."
    if decided_by == "coverage_gate":
        count = runner_up.checkpoints_by_level[UNKNOWN]
        plural = "checkpoint" if count == 1 else "checkpoints"
        miles = runner_up.miles_text(UNKNOWN)
        return (
            f"{w} has a forecast at every checkpoint; {r} has no forecast at "
            f"{count} {plural} ({miles} mi)."
        )
    if decided_by == "provider_order":
        return f"{w} and {r} tie on every criterion; {w} is listed first by the routing provider."

    if decided_by in _MILES_CRITERIA:
        key, name = _MILES_CRITERIA[decided_by]
        main = (
            f"{w} has fewer {name} than {r} "
            f"({winner.miles_text(key)} vs {runner_up.miles_text(key)})."
        )
    elif decided_by == "average_risk":
        main = (
            f"{w} has a lower average risk than {r} "
            f"({winner.avg_risk} vs {runner_up.avg_risk} on a 0 to 4 scale)."
        )
    else:
        main = (
            f"{w} is faster than {r} "
            f"({_duration(winner.travel_minutes)} vs {_duration(runner_up.travel_minutes)})."
        )

    ties = [_describe_tie(winner, c) for c in tied_on if c in _TIE_CRITERIA]
    if ties:
        joined = ties[0] if len(ties) == 1 else ", ".join(ties[:-1]) + " and " + ties[-1]
        main += f" They tie on {joined}."
    return main


_TIE_CRITERIA = (*_MILES_CRITERIA, "average_risk")


def _describe_tie(winner: RouteMetrics, criterion: str) -> str:
    if criterion == "average_risk":
        return f"average risk ({winner.avg_risk})"
    # Ties compare on the displayed scale, so both routes show the same value.
    key, name = _MILES_CRITERIA[criterion]
    return f"{name} ({winner.miles_text(key)})"


def _duration(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    return f"{hours} h {rest:02d} min" if hours else f"{rest} min"
