"""Domain types shared by the risk, geometry, checkpoint, forecast and scoring modules."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import IntEnum

LonLat = tuple[float, float]


class RiskLevel(IntEnum):
    """Ordered risk levels, so ``max()`` over levels gives the most severe one."""

    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def key(self) -> str:
        """Machine-readable name used in API responses, e.g. ``no_travel``."""
        return self.name.lower()

    @property
    def label(self) -> str:
        """Human-readable name, e.g. ``No Travel``."""
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class WeatherSample:
    """Forecast values for one place and one forecast hour. ``None`` means missing.

    Precipitation amounts are totals for the hour, so they are rates in inches per hour.
    """

    forecast_hour: datetime
    gust_mph: Decimal | None
    wind_mph: Decimal | None
    rain_in: Decimal | None
    showers_in: Decimal | None
    snowfall_in: Decimal | None

    @property
    def rain_in_hr(self) -> Decimal | None:
        """Liquid precipitation: large-scale rain plus convective showers."""
        if self.rain_in is None or self.showers_in is None:
            return None
        return self.rain_in + self.showers_in


@dataclass(frozen=True)
class Assessment:
    """Risk at one checkpoint (or heatmap cell) for one forecast hour.

    ``level`` is the most severe known hazard level, which is a lower bound when some
    inputs are missing. It is ``None`` only when no hazard could be classified.
    """

    wind: RiskLevel | None
    rain: RiskLevel | None
    snow: RiskLevel | None
    level: RiskLevel | None
    complete: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class RouteProfile:
    """A route polyline with cumulative distance and travel time at every point."""

    points: tuple[LonLat, ...]
    distance_m: tuple[float, ...]
    elapsed_s: tuple[float, ...]

    @property
    def length_m(self) -> float:
        return self.distance_m[-1]

    @property
    def travel_time_s(self) -> float:
        return self.elapsed_s[-1]


@dataclass(frozen=True)
class Checkpoint:
    """A weather sampling point on a route.

    ``share_mi`` is the stretch of route this checkpoint represents: half the distance to
    each neighbouring checkpoint, so the shares of a route add up to its length.
    """

    route_id: str
    seq: int
    mile: float
    share_mi: float
    position: LonLat
    elapsed_s: float
    eta: datetime
