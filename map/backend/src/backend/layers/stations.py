"""The stations layer: monitoring stations as waypoints, at masked locations.

Role: everything about how stations appear on the map: popup fields, wording, and the
GeoJSON properties. Its data comes only from the ``map_stations`` database function
(supabase S5), which returns masked coordinates and a fixed set of columns. True
coordinates never reach this module. Filters (steps 13-16 of the map plan) will map
query parameters onto that function's parameters here.

Properties of each feature:
    name     StationName
    code     StationCode, or "—" when it's missing
    active   "Yes", "No", or "Unknown" (IsActive is nullable)
    muted    true when the station is inactive, so the map greys it out

Usage:
    from backend.layers.stations import STATIONS
    STATIONS.features(get_database(), {})
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from backend.db import Database
from backend.layers.base import (
    Detail,
    DetailField,
    DetailSection,
    FilterDef,
    FilterValue,
    LayerOptions,
    PopupField,
    StyleBy,
    point_feature,
)

MISSING_CODE = "—"

_ACTIVE_LABELS = {True: "Yes", False: "No", None: "Unknown"}


class StationsLayer:
    """Monitoring stations, drawn at the masked points ``map_stations`` returns.

    Usage:
        layer = StationsLayer()
        layer.features(db, {})
    """

    id = "stations"
    title = "Stations"
    default_visible = True
    location_note = "Approximate location"
    muted_label = "Inactive"
    popup_fields = (
        PopupField("name", "Station"),
        PopupField("code", "Code"),
        PopupField("active", "Active"),
    )
    filters: tuple[FilterDef, ...] = ()
    style_by: StyleBy | None = None

    def options(self, db: Database) -> LayerOptions:
        """Returns the manifest options. There are none until the filters are added.

        Args:
            db: The database (unused for now).

        Returns:
            Empty LayerOptions.

        Usage:
            StationsLayer().options(db)
        """
        return LayerOptions()

    def features(self, db: Database, filters: Mapping[str, FilterValue]) -> list[dict]:
        """Returns every station as a point feature at its masked location.

        Args:
            db: The database.
            filters: Parsed filters. The layer has none yet.

        Returns:
            GeoJSON Point features, in station id order.

        Raises:
            MaskingUnavailableError: The masking secret is missing (the API returns 503).
            UpstreamError: Supabase failed (502).

        Usage:
            StationsLayer().features(db, {})
        """
        return [_to_feature(row) for row in db.rpc("map_stations", {})]

    def detail(self, db: Database, feature_id: int) -> Detail | None:
        """Returns one station's name, code, and status.

        Args:
            db: The database.
            feature_id: The station id.

        Returns:
            A Detail with one Overview section, or None if there's no such station.

        Raises:
            MaskingUnavailableError: The masking secret is missing.
            UpstreamError: Supabase failed.

        Usage:
            StationsLayer().detail(db, 3)
        """
        rows = db.rpc("map_stations", {"p_station": feature_id})
        if not rows:
            return None
        row = rows[0]
        properties = _properties(row)
        return Detail(
            id=row["station_id"],
            title=properties["name"],
            sections=[
                DetailSection(
                    "Overview",
                    fields=[
                        DetailField(field.label, properties[field.key])
                        for field in self.popup_fields
                    ],
                )
            ],
            data={"code": row["code"], "is_active": row["is_active"]},
        )


def _properties(row: Mapping[str, Any]) -> dict[str, Any]:
    """Builds a station's display-ready feature properties from a map_stations row.

    Args:
        row: One row from map_stations.

    Returns:
        ``name``, ``code``, ``active``, and ``muted``.

    Usage:
        _properties({"name": "Harbor", "code": None, "is_active": False, ...})
    """
    return {
        "name": row["name"],
        "code": row["code"] or MISSING_CODE,
        "active": _ACTIVE_LABELS[row["is_active"]],
        "muted": row["is_active"] is False,
    }


def _to_feature(row: Mapping[str, Any]) -> dict[str, Any]:
    """Turns a map_stations row into a GeoJSON point feature.

    Args:
        row: One row from map_stations, with masked ``lon`` and ``lat``.

    Returns:
        A GeoJSON Feature.

    Usage:
        _to_feature(row)
    """
    return point_feature(row["station_id"], row["lon"], row["lat"], _properties(row))


STATIONS = StationsLayer()
