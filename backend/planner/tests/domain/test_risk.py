from datetime import UTC, datetime
from decimal import Decimal

import pytest

from planner.domain.risk import (
    apply_load_rules,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
)
from planner.domain.types import RiskLevel, WeatherSample

LOW = RiskLevel.LOW
MODERATE = RiskLevel.MODERATE
HIGH = RiskLevel.HIGH
SEVERE = RiskLevel.SEVERE
NO_TRAVEL = RiskLevel.NO_TRAVEL

HOUR = datetime(2026, 10, 16, 15, tzinfo=UTC)


def sample(
    gust: str | None = "0",
    wind: str | None = "0",
    rain: str | None = "0",
    showers: str | None = "0",
    snow: str | None = "0",
) -> WeatherSample:
    def dec(value: str | None) -> Decimal | None:
        return None if value is None else Decimal(value)

    return WeatherSample(HOUR, dec(gust), dec(wind), dec(rain), dec(showers), dec(snow))


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        ("0", LOW),
        ("24.9", LOW),
        ("25", MODERATE),
        ("25.1", MODERATE),
        ("34.9", MODERATE),
        ("34.6", MODERATE),
        ("35", HIGH),
        ("44.9", HIGH),
        ("45", SEVERE),
        ("54.9", SEVERE),
        ("55", NO_TRAVEL),
        ("55.1", NO_TRAVEL),
        ("120", NO_TRAVEL),
    ],
)
def test_wind_bands(mph: str, expected: RiskLevel) -> None:
    assert classify_wind(Decimal(mph)) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        ("0", LOW),
        ("0.099", LOW),
        ("0.10", MODERATE),
        ("0.101", MODERATE),
        ("0.249", MODERATE),
        ("0.25", HIGH),
        ("0.499", HIGH),
        ("0.50", SEVERE),
        ("0.999", SEVERE),
        ("1.00", SEVERE),
        ("1.001", NO_TRAVEL),
        ("2.5", NO_TRAVEL),
    ],
)
def test_rain_bands(in_hr: str, expected: RiskLevel) -> None:
    assert classify_rain(Decimal(in_hr)) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        ("0", LOW),
        ("0.49", LOW),
        ("0.5", MODERATE),
        ("0.99", MODERATE),
        ("1.0", HIGH),
        ("1.99", HIGH),
        ("2.0", SEVERE),
        ("2.99", SEVERE),
        ("3.0", SEVERE),
        ("3.01", NO_TRAVEL),
    ],
)
def test_snow_bands(in_hr: str, expected: RiskLevel) -> None:
    assert classify_snow(Decimal(in_hr)) is expected


@pytest.mark.parametrize(
    ("gust", "load_lb", "expected"),
    [
        # L1: 55 mph or more is No Travel for any load.
        ("55", 0, NO_TRAVEL),
        ("60", 10_000, NO_TRAVEL),
        # L2: 45-54 mph with more than 30,000 lb is No Travel.
        ("45", 30_000, SEVERE),
        ("45", 30_001, NO_TRAVEL),
        ("54.9", 30_001, NO_TRAVEL),
        ("44.9", 30_001, HIGH),
        # L3: 35-44 mph with more than 40,000 lb is Severe.
        ("35", 40_000, HIGH),
        ("35", 40_001, SEVERE),
        ("44.9", 40_001, SEVERE),
        ("34.9", 40_001, MODERATE),
        # Heavier loads in a higher band fall under L2, not L3.
        ("45", 40_001, NO_TRAVEL),
        # No rule applies below 35 mph, whatever the load.
        ("24.9", 80_000, LOW),
        ("30", 80_000, MODERATE),
    ],
)
def test_load_rules(gust: str, load_lb: int, expected: RiskLevel) -> None:
    level, _rule = apply_load_rules(Decimal(gust), load_lb)
    assert level is expected


def test_load_rule_reports_when_it_raised_the_level() -> None:
    assert apply_load_rules(Decimal("47"), 32_000) == (NO_TRAVEL, True)
    assert apply_load_rules(Decimal("47"), 30_000) == (SEVERE, False)
    # L1 never raises: the band is already No Travel.
    assert apply_load_rules(Decimal("57"), 50_000) == (NO_TRAVEL, False)


def test_assess_classifies_on_gusts_by_default() -> None:
    result = assess(sample(gust="47", wind="20"), load_lb=10_000)

    assert result.wind is SEVERE
    assert result.level is SEVERE


def test_assess_can_classify_on_sustained_wind() -> None:
    result = assess(sample(gust="47", wind="20"), load_lb=10_000, wind_metric="sustained")

    assert result.wind is LOW


def test_rain_is_rain_plus_showers() -> None:
    result = assess(sample(rain="0.06", showers="0.05"), load_lb=0)

    assert result.rain is MODERATE


def test_checkpoint_level_is_the_most_severe_hazard() -> None:
    result = assess(sample(gust="36", rain="0.3", snow="2.5"), load_lb=0)

    assert (result.wind, result.rain, result.snow) == (HIGH, HIGH, SEVERE)
    assert result.level is SEVERE
    assert result.complete


def test_no_travel_from_any_hazard_is_never_hidden() -> None:
    result = assess(sample(gust="10", rain="1.2"), load_lb=0)

    assert result.level is NO_TRAVEL


def test_load_rule_raises_the_checkpoint_level() -> None:
    result = assess(sample(gust="47", rain="0.3"), load_lb=32_000)

    assert result.wind is NO_TRAVEL
    assert result.level is NO_TRAVEL
    assert "Gust 47 mph with 32,000 lb load → No Travel (load rule)" in result.reasons


def test_missing_input_gives_a_lower_bound_not_low() -> None:
    result = assess(sample(gust=None, snow="2.5"), load_lb=0)

    assert result.wind is None
    assert result.level is SEVERE
    assert not result.complete
    assert "Wind gust forecast unavailable" in result.reasons


def test_missing_showers_makes_rain_unknown() -> None:
    result = assess(sample(showers=None), load_lb=0)

    assert result.rain is None
    assert result.level is LOW
    assert not result.complete


def test_all_inputs_missing_is_unknown() -> None:
    result = assess(sample(gust=None, rain=None, snow=None), load_lb=0)

    assert result.level is None
    assert not result.complete


def test_calm_weather_has_no_reasons() -> None:
    result = assess(sample(), load_lb=20_000)

    assert result.level is LOW
    assert result.reasons == ()


def test_reasons_show_values_without_rounding_across_a_threshold() -> None:
    result = assess(sample(gust="34.6", rain="0.098", showers="0"), load_lb=0)

    assert result.reasons == ("Gust 34.6 mph → Moderate",)


@pytest.mark.parametrize("hazard", ["gust", "rain", "snow"])
def test_risk_never_decreases_as_a_hazard_increases(hazard: str) -> None:
    previous = LOW
    for step in range(0, 801):
        value = Decimal(step) / Decimal(100) * (Decimal(20) if hazard == "gust" else Decimal(1))
        kwargs = {"gust": "0", "rain": "0", "snow": "0", hazard: str(value)}
        level = assess(sample(**kwargs), load_lb=0).level
        assert level is not None
        assert level >= previous
        previous = level


def test_risk_never_decreases_as_load_increases() -> None:
    for gust in ("20", "35", "40", "45", "50", "55"):
        previous = LOW
        for load_lb in range(0, 80_001, 500):
            level = assess(sample(gust=gust), load_lb=load_lb).level
            assert level is not None
            assert level >= previous
            previous = level


_LOAD_RULE_WINDS = {
    "24.9": LOW,
    "25": MODERATE,
    "34.9": MODERATE,
    "35": HIGH,
    "44.9": HIGH,
    "45": SEVERE,
    "54.9": SEVERE,
    "55": NO_TRAVEL,
}


@pytest.mark.parametrize("load_lb", [30_000, 30_001, 40_000, 40_001])
@pytest.mark.parametrize("gust", list(_LOAD_RULE_WINDS))
def test_load_rules_full_cross_product(gust: str, load_lb: int) -> None:
    band = _LOAD_RULE_WINDS[gust]
    wind = Decimal(gust)
    expected = band
    if Decimal(45) <= wind < Decimal(55) and load_lb > 30_000:
        expected = NO_TRAVEL
    elif Decimal(35) <= wind < Decimal(45) and load_lb > 40_000:
        expected = SEVERE

    assert apply_load_rules(wind, load_lb)[0] is expected


@pytest.mark.parametrize(
    ("rain", "showers", "expected"),
    [
        ("0.05", "0.05", MODERATE),
        ("0.125", "0.125", HIGH),
        ("0.50", "0.50", SEVERE),
        ("0.501", "0.5", NO_TRAVEL),
    ],
)
def test_rain_and_showers_summing_to_an_edge(rain: str, showers: str, expected: RiskLevel) -> None:
    assert assess(sample(rain=rain, showers=showers), load_lb=0).rain is expected


def test_equivalent_decimal_forms_classify_the_same() -> None:
    assert classify_rain(Decimal("1.000")) is SEVERE
    assert classify_snow(Decimal("3.00")) is SEVERE
    assert classify_wind(Decimal("-0")) is LOW


@pytest.mark.parametrize("value", [47, 47.0, Decimal("NaN"), Decimal("Infinity")])
def test_weather_values_must_be_finite_decimals(value: object) -> None:
    with pytest.raises(ValueError):
        WeatherSample(HOUR, value, None, None, None, None)  # type: ignore[arg-type]


def test_sustained_metric_ignores_a_missing_gust() -> None:
    result = assess(sample(gust=None, wind="30"), load_lb=0, wind_metric="sustained")

    assert result.wind is MODERATE
    assert result.complete
