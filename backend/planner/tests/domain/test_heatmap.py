from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from planner.domain.forecast import HourlyForecast, forecast_window
from planner.domain.heatmap import heatmap_frames

DEPARTURE = datetime(2026, 10, 16, 14, 20, tzinfo=UTC)
WINDOW = forecast_window(DEPARTURE, DEPARTURE, now=DEPARTURE)  # 49 hours from 15:00 UTC


def forecast_with_gusts(gusts: Sequence[str | None]) -> HourlyForecast:
    zeros = tuple(Decimal(0) for _ in gusts)
    return HourlyForecast(
        gust_mph=tuple(None if g is None else Decimal(g) for g in gusts),
        wind_mph=zeros,
        rain_in=zeros,
        showers_in=zeros,
        snowfall_in=zeros,
    )


def test_one_frame_per_hour_with_one_level_per_cell() -> None:
    cells = [forecast_with_gusts(["0"] * WINDOW.hours)] * 3

    frames = heatmap_frames(cells, WINDOW, DEPARTURE, load_lb=0)

    assert len(frames) == 49
    assert all(frame == (0, 0, 0) for frame in frames)


def test_frame_k_uses_the_record_covering_departure_plus_k_hours() -> None:
    gusts = ["0"] * WINDOW.hours
    gusts[5] = "40"  # the record labelled 20:00 UTC covers 19:00-20:00

    frames = heatmap_frames([forecast_with_gusts(gusts)], WINDOW, DEPARTURE, load_lb=0)

    assert DEPARTURE + timedelta(hours=5) == datetime(2026, 10, 16, 19, 20, tzinfo=UTC)
    assert frames[4] == (0,)
    assert frames[5] == (2,)
    assert frames[6] == (0,)


def test_frames_apply_the_load_rules() -> None:
    cell = forecast_with_gusts(["47"] * WINDOW.hours)

    light = heatmap_frames([cell], WINDOW, DEPARTURE, load_lb=30_000)
    heavy = heatmap_frames([cell], WINDOW, DEPARTURE, load_lb=30_001)

    assert light[0] == (3,)
    assert heavy[0] == (4,)


def test_missing_forecast_is_none_not_low() -> None:
    zeros = tuple(Decimal(0) for _ in range(WINDOW.hours))
    nothing = tuple(None for _ in range(WINDOW.hours))
    cell = HourlyForecast(nothing, zeros, nothing, nothing, nothing)

    frames = heatmap_frames([cell], WINDOW, DEPARTURE, load_lb=0)

    assert frames[0] == (None,)


@pytest.mark.parametrize("minute_second", [(0, 0), (59, 59)])
def test_frame_48_uses_the_last_record_of_the_window(minute_second: tuple[int, int]) -> None:
    departure = datetime(2026, 10, 16, 14, *minute_second, tzinfo=UTC)
    window = forecast_window(departure, departure, now=departure)
    gusts = ["0"] * window.hours
    gusts[-1] = "50"

    frames = heatmap_frames([forecast_with_gusts(gusts)], window, departure, load_lb=0)

    assert frames[48] == (3,)
    assert frames[47] == (0,)


def test_a_cell_with_missing_inputs_is_unknown_unless_a_known_hazard_is_above_low() -> None:
    zeros = tuple(Decimal(0) for _ in range(WINDOW.hours))
    nothing = tuple(None for _ in range(WINDOW.hours))
    deep_snow = tuple(Decimal("2.5") for _ in range(WINDOW.hours))
    calm_but_no_gust = HourlyForecast(nothing, zeros, zeros, zeros, zeros)
    snowy_but_no_gust = HourlyForecast(nothing, zeros, zeros, zeros, deep_snow)

    frames = heatmap_frames([calm_but_no_gust, snowy_but_no_gust], WINDOW, DEPARTURE, 50_000)

    assert frames[0] == (None, 3)
