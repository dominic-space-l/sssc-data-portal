"""The stations layer: monitoring stations as waypoints, at masked locations.

Role: everything about how stations appear on the map: popup fields, wording, filters,
and the GeoJSON properties. Its data comes only from two database functions (supabase
S5 and S6). ``map_stations`` returns masked coordinates and a fixed set of columns, so
true coordinates never reach this module. ``map_filter_options`` supplies every filter's
options.

Properties of each feature:
    name     StationName
    code     StationCode, or "—" when it's missing
    active   "Yes", "No", or "Unknown" (IsActive is nullable)
    muted    true when the station is inactive, so the map greys it out
    roles    only when an organization is chosen: the sorted ids of the roles it holds
             at the station ([] for none). The layer's style_by colors markers by it.

Filters (query parameter -> map_stations parameter):
    project            select      -> p_project (projects with no stations are hinted)
    organization       select      -> p_organization (filters only without a project;
                                      always sets the roles, see map_stations)
    station_type       multiselect -> p_station_types
    observation_type   multiselect -> p_observation_types

Usage:
    from backend.layers.stations import STATIONS
    STATIONS.features(get_database(), {"station_type": [1, 2]})
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from backend.db import Database
from backend.layers.base import (
    Detail,
    DetailField,
    DetailSection,
    FilterDef,
    FilterOption,
    FilterType,
    FilterValue,
    LayerOptions,
    PopupField,
    StyleBy,
    StyleValue,
    point_feature,
)

MISSING_CODE = "—"

# Shown after a project's name in the filter when it has no stations.
NO_STATIONS_HINT = "No stations"

_ACTIVE_LABELS = {True: "Yes", False: "No", None: "Unknown"}

# The map_stations parameter each filter is passed as.
_RPC_PARAMS = {
    "project": "p_project",
    "organization": "p_organization",
    "station_type": "p_station_types",
    "observation_type": "p_observation_types",
}


def _id_name_options(items: Sequence[Mapping[str, Any]]) -> list[FilterOption]:
    """Turns ``[{"id", "name"}, ...]`` from map_filter_options into filter options.

    Args:
        items: One list from map_filter_options, already sorted by the database.

    Returns:
        One option per item, in the same order.

    Usage:
        _id_name_options(options["station_types"])
    """
    return [FilterOption(item["id"], item["name"]) for item in items]


def _project_options(projects: Sequence[Mapping[str, Any]]) -> list[FilterOption]:
    """Turns map_filter_options projects into options, hinting those with no stations.

    Args:
        projects: ``[{"id", "name", "organization_id", "station_count"}, ...]``, sorted
            by name.

    Returns:
        One option per project, in the same order. Projects with a station count of
        0 get the hint "No stations".

    Usage:
        _project_options(options["projects"])
    """
    return [
        FilterOption(
            project["id"],
            project["name"],
            hint=NO_STATIONS_HINT if project["station_count"] == 0 else None,
        )
        for project in projects
    ]


# How each filter's options are built from the map_filter_options result.
_OPTION_BUILDERS: dict[str, Callable[[Mapping[str, Any]], list[FilterOption]]] = {
    "project": lambda options: _project_options(options["projects"]),
    "organization": lambda options: _id_name_options(options["organizations"]),
    "station_type": lambda options: _id_name_options(options["station_types"]),
    "observation_type": lambda options: _id_name_options(options["observation_types"]),
}


class StationsLayer:
    """Monitoring stations, drawn at the masked points ``map_stations`` returns.

    Usage:
        layer = StationsLayer()
        layer.features(db, {"observation_type": [3]})
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
    filters = (
        FilterDef("project", "Project", FilterType.SELECT),
        FilterDef("organization", "Organization", FilterType.SELECT),
        FilterDef("station_type", "Station type", FilterType.MULTISELECT),
        FilterDef("observation_type", "Observes", FilterType.MULTISELECT),
    )
    style_by = StyleBy(
        property="roles",
        label="Role",
        active_when="organization",
        fallback_label="No role with this organization",
    )

    def options(self, db: Database) -> LayerOptions:
        """Reads every filter's options with one ``map_filter_options`` call.

        Args:
            db: The database.

        Returns:
            Options for each filter, in the order the database sorts them (by name),
            and the roles as style_by values, in RoleID order (the color order).

        Raises:
            UpstreamError: Supabase failed.

        Usage:
            StationsLayer().options(db)
        """
        options = db.rpc("map_filter_options")
        return LayerOptions(
            filters={f.key: _OPTION_BUILDERS[f.key](options) for f in self.filters},
            style_values=[StyleValue(role["id"], role["name"]) for role in options["roles"]],
        )

    def features(self, db: Database, filters: Mapping[str, FilterValue]) -> list[dict]:
        """Returns the matching stations as point features at their masked locations.

        Args:
            db: The database.
            filters: Parsed filters. Unset (None) filters aren't sent, so
                ``map_stations`` treats them as "no filter".

        Returns:
            GeoJSON Point features, in station id order.

        Raises:
            MaskingUnavailableError: The masking secret is missing (the API returns 503).
            UpstreamError: Supabase failed (502).

        Usage:
            StationsLayer().features(db, {"station_type": [1]})
        """
        return [_to_feature(row) for row in db.rpc("map_stations", _rpc_params(filters))]

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


def _rpc_params(filters: Mapping[str, FilterValue]) -> dict[str, Any]:
    """Maps parsed filters onto map_stations parameters, leaving out unset ones.

    Args:
        filters: Parsed filters by key.

    Returns:
        The rpc params, e.g. ``{"p_station_types": [1, 2]}``.

    Usage:
        _rpc_params({"station_type": [1], "observation_type": None})
    """
    return {
        _RPC_PARAMS[key]: value
        for key, value in filters.items()
        if value is not None and key in _RPC_PARAMS
    }


def _properties(row: Mapping[str, Any]) -> dict[str, Any]:
    """Builds a station's display-ready feature properties from a map_stations row.

    Args:
        row: One row from map_stations.

    Returns:
        ``name``, ``code``, ``active``, and ``muted``, plus ``roles`` when the row has
        them (an organization was chosen).

    Usage:
        _properties({"name": "Harbor", "code": None, "is_active": False, ...})
    """
    properties = {
        "name": row["name"],
        "code": row["code"] or MISSING_CODE,
        "active": _ACTIVE_LABELS[row["is_active"]],
        "muted": row["is_active"] is False,
    }
    if row.get("roles") is not None:
        properties["roles"] = list(row["roles"])
    return properties


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
