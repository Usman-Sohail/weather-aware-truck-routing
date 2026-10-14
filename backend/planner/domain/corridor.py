"""The heatmap corridor grid and the per-plan forecast location budget.

The browser fetches every forecast location in one Open-Meteo request, and each
location costs at least one call against the viewer's rate limit. The budget below keeps
a plan within one request and within the hosting platform's request-body limit.
"""

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from planner.domain.geometry import METERS_PER_MILE, locate_at_distance
from planner.domain.types import LonLat, RouteProfile

LATITUDE_STEPS_DEG = (0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.75, 1.00, 1.50)
CORRIDOR_SAMPLE_SPACING_MI = 2.0
MILES_PER_DEGREE_LATITUDE = 69.09

MAX_LOCATIONS = 1_000
MAX_CHECKPOINT_LOCATIONS = 850
MAX_CORRIDOR_CELLS = 300
INTERVALS_MI = (10, 25, 50)

RELAY_BYTES_PER_LOCATION_HOUR = 46
MAX_RELAY_BYTES = 3_800_000

Cell = tuple[int, int]


class IntervalTooFineError(Exception):
    """Too many checkpoint locations for the chosen interval; a coarser one would fit."""

    def __init__(self, suggested_interval_mi: int) -> None:
        self.suggested_interval_mi = suggested_interval_mi
        super().__init__(f"Use a sampling interval of {suggested_interval_mi} miles or more.")


class TripTooLargeError(Exception):
    """The trip needs more forecast data than one plan can carry."""


@dataclass(frozen=True)
class Corridor:
    """Square cells (on the ground) around the routes, as (column, row) lattice indices."""

    step_lat_deg: float
    step_lon_deg: float
    cells: tuple[Cell, ...]

    @property
    def approx_cell_mi(self) -> float:
        return self.step_lat_deg * MILES_PER_DEGREE_LATITUDE

    def south_west(self, cell: Cell) -> LonLat:
        column, row = cell
        return (column * self.step_lon_deg, row * self.step_lat_deg)

    def center(self, cell: Cell) -> LonLat:
        west, south = self.south_west(cell)
        return (west + self.step_lon_deg / 2, south + self.step_lat_deg / 2)


def corridor_budget(checkpoint_locations: int) -> int:
    return min(MAX_CORRIDOR_CELLS, MAX_LOCATIONS - checkpoint_locations)


def check_checkpoint_budget(checkpoint_locations: int, interval_mi: int) -> None:
    """Reject plans with too many checkpoint locations, suggesting an interval that fits."""
    if checkpoint_locations <= MAX_CHECKPOINT_LOCATIONS:
        return
    for candidate in INTERVALS_MI:
        estimate = checkpoint_locations * interval_mi / candidate
        if candidate > interval_mi and estimate <= MAX_CHECKPOINT_LOCATIONS:
            raise IntervalTooFineError(candidate)
    raise TripTooLargeError("This trip is too long to plan, even at the largest interval.")


def check_relay_size(locations: int, hours: int) -> None:
    if locations * hours * RELAY_BYTES_PER_LOCATION_HOUR > MAX_RELAY_BYTES:
        raise TripTooLargeError("This trip needs more forecast data than one plan can carry.")


def build_corridor(profiles: Sequence[RouteProfile], max_cells: int) -> Corridor:
    """The finest grid whose cells around all routes fit within ``max_cells``."""
    samples = list(_samples_along(profiles))
    mean_latitude = math.radians(sum(lat for _, lat in samples) / len(samples))
    for step_lat in LATITUDE_STEPS_DEG:
        step_lon = step_lat / math.cos(mean_latitude)
        cells = _cells_around(samples, step_lat, step_lon)
        if len(cells) <= max_cells:
            ordered = tuple(sorted(cells, key=lambda cell: (cell[1], cell[0])))
            return Corridor(step_lat, step_lon, ordered)
    raise TripTooLargeError("The routes are too spread out to draw a weather corridor.")


def _samples_along(profiles: Iterable[RouteProfile]) -> Iterable[LonLat]:
    for profile in profiles:
        length_mi = profile.length_m / METERS_PER_MILE
        count = max(1, math.ceil(length_mi / CORRIDOR_SAMPLE_SPACING_MI))
        for i in range(count + 1):
            position, _elapsed = locate_at_distance(profile, profile.length_m * i / count)
            yield position


def _cells_around(samples: Iterable[LonLat], step_lat: float, step_lon: float) -> set[Cell]:
    """Every cell a route passes through, plus its eight neighbours."""
    cells: set[Cell] = set()
    for lon, lat in samples:
        column, row = math.floor(lon / step_lon), math.floor(lat / step_lat)
        for d_column in (-1, 0, 1):
            for d_row in (-1, 0, 1):
                cells.add((column + d_column, row + d_row))
    return cells
