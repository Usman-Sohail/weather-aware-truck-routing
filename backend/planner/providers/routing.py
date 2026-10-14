"""The routing interface the planner depends on, independent of any provider."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from planner.domain.types import LonLat, RouteProfile


@dataclass(frozen=True)
class RouteOption:
    """One route, in the provider's order of preference."""

    provider_index: int
    profile: RouteProfile


@dataclass(frozen=True)
class Place:
    """A geocoded place with the time zone used to read local departure times."""

    name: str
    position: LonLat
    country_code: str
    time_zone: str


class RoutingProvider(Protocol):
    def find_routes(
        self, origin: LonLat, destination: LonLat, depart_at: datetime | None
    ) -> tuple[RouteOption, ...]:
        """Up to three truck routes, best first; ``depart_at`` of ``None`` means now."""
        ...

    def geocode(self, query: str) -> tuple[Place, ...]:
        """Places in the United States and Canada matching ``query``, best first."""
        ...
