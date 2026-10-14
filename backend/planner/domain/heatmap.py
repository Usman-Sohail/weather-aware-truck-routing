"""Hourly heatmap frames: the load-adjusted risk level of every corridor cell.

Frame k shows the forecast for departure + k hours, matched with the same rule and
classified with the same function as the checkpoints.
"""

from collections.abc import Sequence
from datetime import datetime

from planner.domain.forecast import HOUR, SLIDER_HOURS, ForecastWindow, HourlyForecast, sample_at
from planner.domain.risk import assess
from planner.domain.types import RiskLevel

Frame = tuple[int | None, ...]


def heatmap_frames(
    cells: Sequence[HourlyForecast],
    window: ForecastWindow,
    departure: datetime,
    load_lb: int,
    hours: int = SLIDER_HOURS,
) -> tuple[Frame, ...]:
    """Risk level (0-4) per cell for each hour 0..``hours``; ``None`` where unknown.

    With some inputs missing, a cell shows its known level only if that is above Low.
    """
    frames = []
    for hour in range(hours + 1):
        moment = departure + hour * HOUR
        levels: list[int | None] = []
        for cell in cells:
            assessment = assess(sample_at(cell, window, moment), load_lb)
            level = assessment.level
            # Missing inputs make the level a lower bound; a lower bound of Low says nothing.
            if level is None or (level is RiskLevel.LOW and not assessment.complete):
                levels.append(None)
            else:
                levels.append(int(level))
        frames.append(tuple(levels))
    return tuple(frames)
