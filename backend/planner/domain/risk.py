"""Weather risk classification and truck-load rules.

Thresholds come from the assessment brief. The brief's bands overlap at their edges, so
a shared edge belongs to the higher band, except where the brief writes the No Travel
bound as a strict ">" (rain and snow), in which case the edge value stays Severe.
All values are ``Decimal`` so that no floating-point error can move a value across an edge.
"""

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from planner.domain.types import Assessment, RiskLevel, WeatherSample

WindMetric = Literal["gust", "sustained"]

# Wind is classified on the hourly maximum gust. Gusts are never below the sustained
# speed, so this is the conservative reading of the brief's single "Wind" row, and it is
# the wind that tips over high-profile trailers.
WIND_METRIC: WindMetric = "gust"


@dataclass(frozen=True)
class Threshold:
    """The bound at which a value reaches ``level``; ``strict`` excludes the bound itself."""

    level: RiskLevel
    bound: Decimal
    strict: bool = False

    def is_reached_by(self, value: Decimal) -> bool:
        return value > self.bound if self.strict else value >= self.bound


# Each tuple is ordered from the most to the least severe level; anything below is Low.
WIND_THRESHOLDS_MPH = (
    Threshold(RiskLevel.NO_TRAVEL, Decimal("55")),
    Threshold(RiskLevel.SEVERE, Decimal("45")),
    Threshold(RiskLevel.HIGH, Decimal("35")),
    Threshold(RiskLevel.MODERATE, Decimal("25")),
)
RAIN_THRESHOLDS_IN_HR = (
    Threshold(RiskLevel.NO_TRAVEL, Decimal("1.00"), strict=True),
    Threshold(RiskLevel.SEVERE, Decimal("0.50")),
    Threshold(RiskLevel.HIGH, Decimal("0.25")),
    Threshold(RiskLevel.MODERATE, Decimal("0.10")),
)
SNOW_THRESHOLDS_IN_HR = (
    Threshold(RiskLevel.NO_TRAVEL, Decimal("3.0"), strict=True),
    Threshold(RiskLevel.SEVERE, Decimal("2.0")),
    Threshold(RiskLevel.HIGH, Decimal("1.0")),
    Threshold(RiskLevel.MODERATE, Decimal("0.5")),
)


@dataclass(frozen=True)
class LoadRule:
    """Raises the wind level to ``level`` within a wind band for loads above a limit."""

    wind_from_mph: Decimal
    wind_below_mph: Decimal | None
    load_above_lb: int | None
    level: RiskLevel

    def applies(self, wind_mph: Decimal, load_lb: int) -> bool:
        if wind_mph < self.wind_from_mph:
            return False
        if self.wind_below_mph is not None and wind_mph >= self.wind_below_mph:
            return False
        return self.load_above_lb is None or load_lb > self.load_above_lb


LOAD_RULES = (
    # 55 mph or more: No Travel for any load.
    LoadRule(Decimal("55"), None, None, RiskLevel.NO_TRAVEL),
    # 45-54 mph with more than 30,000 lb: No Travel.
    LoadRule(Decimal("45"), Decimal("55"), 30_000, RiskLevel.NO_TRAVEL),
    # 35-44 mph with more than 40,000 lb: Severe.
    LoadRule(Decimal("35"), Decimal("45"), 40_000, RiskLevel.SEVERE),
)


def _classify(value: Decimal, thresholds: tuple[Threshold, ...]) -> RiskLevel:
    for threshold in thresholds:
        if threshold.is_reached_by(value):
            return threshold.level
    return RiskLevel.LOW


def classify_wind(mph: Decimal) -> RiskLevel:
    return _classify(mph, WIND_THRESHOLDS_MPH)


def classify_rain(in_hr: Decimal) -> RiskLevel:
    return _classify(in_hr, RAIN_THRESHOLDS_IN_HR)


def classify_snow(in_hr: Decimal) -> RiskLevel:
    return _classify(in_hr, SNOW_THRESHOLDS_IN_HR)


def apply_load_rules(wind_mph: Decimal, load_lb: int) -> tuple[RiskLevel, bool]:
    """Return the load-adjusted wind level and whether a load rule raised it."""
    band_level = classify_wind(wind_mph)
    rule_levels = [rule.level for rule in LOAD_RULES if rule.applies(wind_mph, load_lb)]
    adjusted = max([band_level, *rule_levels])
    return adjusted, adjusted > band_level


def assess(
    sample: WeatherSample, load_lb: int, wind_metric: WindMetric = WIND_METRIC
) -> Assessment:
    """Classify every hazard, apply the load rules and combine into one level."""
    reasons: list[str] = []

    if wind_metric == "gust":
        wind_value, wind_name, wind_forecast = sample.gust_mph, "Gust", "Wind gust"
    else:
        wind_value, wind_name, wind_forecast = sample.wind_mph, "Wind", "Wind"

    wind: RiskLevel | None = None
    if wind_value is None:
        reasons.append(f"{wind_forecast} forecast unavailable")
    else:
        wind, raised_by_load = apply_load_rules(wind_value, load_lb)
        if raised_by_load:
            reasons.append(
                f"{wind_name} {_format(wind_value)} mph with {load_lb:,} lb load "
                f"→ {wind.label} (load rule)"
            )
        elif wind > RiskLevel.LOW:
            reasons.append(f"{wind_name} {_format(wind_value)} mph → {wind.label}")

    rain, rain_lower_bound = _assess_rain(sample, reasons)
    snow = _classify_hazard(sample.snowfall_in, classify_snow, "Snowfall", reasons)

    known = [level for level in (wind, rain_lower_bound, snow) if level is not None]
    return Assessment(
        wind=wind,
        rain=rain,
        snow=snow,
        level=max(known) if known else None,
        complete=wind is not None and rain is not None and snow is not None,
        reasons=tuple(reasons),
    )


def _assess_rain(
    sample: WeatherSample, reasons: list[str]
) -> tuple[RiskLevel | None, RiskLevel | None]:
    """Return the rain level (``None`` unless both inputs are known) and a lower bound.

    Rain is rain plus showers. Both are non-negative, so when only one is known it is a
    lower bound on the total and still counts towards the checkpoint level.
    """
    rain, showers = sample.rain_in, sample.showers_in
    if rain is not None and showers is not None:
        level = classify_rain(rain + showers)
        if level > RiskLevel.LOW:
            reasons.append(f"Rain {_format(rain + showers)} in/hr → {level.label}")
        return level, level
    if rain is not None:
        known, missing = rain, "showers"
    elif showers is not None:
        known, missing = showers, "large-scale rain"
    else:
        reasons.append("Rain forecast unavailable")
        return None, None

    lower_bound = classify_rain(known)
    if lower_bound > RiskLevel.LOW:
        reasons.append(
            f"Rain at least {_format(known)} in/hr ({missing} forecast unavailable) "
            f"→ {lower_bound.label}"
        )
    else:
        reasons.append(f"Rain forecast incomplete ({missing} unavailable)")
    return None, lower_bound


def _classify_hazard(
    value: Decimal | None,
    classify: Callable[[Decimal], RiskLevel],
    name: str,
    reasons: list[str],
) -> RiskLevel | None:
    if value is None:
        reasons.append(f"{name} forecast unavailable")
        return None
    level = classify(value)
    if level > RiskLevel.LOW:
        reasons.append(f"{name} {_format(value)} in/hr → {level.label}")
    return level


def _format(value: Decimal) -> str:
    """Show the forecast value exactly as provided, without trailing zeros."""
    return format(value.normalize(), "f")
