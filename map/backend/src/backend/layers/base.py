"""The layer framework: what a map layer is, and the types it's described with.

Role: defines the ``Layer`` protocol that every layer module implements, the value types
for its manifest entry (popup fields, filters and their options, ``style_by``), the
types for its detail view, and the query-parameter parsing for its filters. The API in
``backend.api`` works only with these types, so it never needs to know which layers
exist (see the "Core idea: layers" section of documentation/map/map_app_plan.md).

A layer has two parts:
    static     id, title, popup fields, filter definitions, the style_by shape. The
               features route parses query parameters with these alone.
    dynamic    ``options(db)``: filter options and style_by values, read from the
               database only when the manifest is built.

Usage:
    filters = parse_filters(layer.filters, request.args)    # FilterError -> 400
    features = layer.features(db, filters)
    entry = build_manifest_entry(layer, db)
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol

from werkzeug.datastructures import MultiDict

from backend.db import Database

# Largest Postgres bigint. Ids above it would fail in the database as a 502, so they're
# refused here as a 400 instead.
MAX_ID = 2**63 - 1

# Most values one multiselect filter accepts in a request.
MAX_MULTISELECT_VALUES = 100

# ASCII digits only: \d (and int()) would also accept other scripts' digits.
_ID_PATTERN = re.compile(r"[0-9]{1,19}")
_TRUE = {"true", "1"}
_FALSE = {"false", "0"}

FilterValue = int | bool | list[int] | None


class FilterError(ValueError):
    """A query parameter is invalid. Its message is safe to show the user."""


class FilterType(StrEnum):
    """How a filter is shown and what values it takes."""

    BOOLEAN = "boolean"  # a checkbox: true or false
    SELECT = "select"  # a dropdown: one id
    MULTISELECT = "multiselect"  # a checkbox list: any number of ids


# ---------------------------------------------------------------------------------------
# Manifest types
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class PopupField:
    """A feature property shown in the marker popup.

    Attributes:
        key: The property name in ``feature.properties``.
        label: The label shown next to the value.
    """

    key: str
    label: str

    def to_json(self) -> dict[str, Any]:
        """Serializes for the manifest.

        Returns:
            ``{"key": ..., "label": ...}``.

        Usage:
            PopupField("name", "Station").to_json()
        """
        return {"key": self.key, "label": self.label}


@dataclass(frozen=True)
class FilterOption:
    """One choice in a select or multiselect filter.

    Attributes:
        value: The id sent back as the filter's value.
        label: The text shown for it.
        implies: Other filters this choice also sets, e.g. ``{"organization": 2}``.
        hint: A short tag shown after the label, e.g. ``"No stations"``.
    """

    value: int
    label: str
    implies: Mapping[str, int] | None = None
    hint: str | None = None

    def to_json(self) -> dict[str, Any]:
        """Serializes for the manifest, leaving out unset optional keys.

        Returns:
            ``{"value", "label"}``, plus ``implies`` and ``hint`` when set.

        Usage:
            FilterOption(4, "Tide Gauges", implies={"organization": 2}).to_json()
        """
        data: dict[str, Any] = {"value": self.value, "label": self.label}
        if self.implies is not None:
            data["implies"] = dict(self.implies)
        if self.hint is not None:
            data["hint"] = self.hint
        return data


@dataclass(frozen=True)
class FilterDef:
    """A filter a layer accepts as a query parameter on its features route.

    Attributes:
        key: The query parameter name, e.g. ``"station_type"``.
        label: The control's label in the filter panel.
        type: How it's shown and parsed.

    Usage:
        FilterDef("station_type", "Station type", FilterType.MULTISELECT)
    """

    key: str
    label: str
    type: FilterType

    def parse(self, raw: Sequence[str]) -> FilterValue:
        """Parses this filter's raw query values.

        Blank values are ignored, so ``?project=`` means no filter. A multiselect takes
        repeated parameters, comma-separated values, or both, and drops duplicates.

        Args:
            raw: Every value given for ``key`` in the query string (possibly none).

        Returns:
            None when no value was given. Otherwise an int (select), a bool
            (boolean), or a non-empty list of ints (multiselect).

        Raises:
            FilterError: A value isn't a valid id or boolean, a single-value filter
                was given more than once, or a multiselect has too many values.

        Usage:
            FilterDef("project", "Project", FilterType.SELECT).parse(["4"])  # 4
        """
        if self.type is FilterType.MULTISELECT:
            parts = [part.strip() for value in raw for part in value.split(",")]
        else:
            parts = [value.strip() for value in raw]
        parts = [part for part in parts if part]
        if not parts:
            return None

        if self.type is FilterType.MULTISELECT:
            ids = list(dict.fromkeys(self._parse_id(part) for part in parts))
            if len(ids) > MAX_MULTISELECT_VALUES:
                raise FilterError(f"{self.key} accepts at most {MAX_MULTISELECT_VALUES} values.")
            return ids

        if len(parts) > 1:
            raise FilterError(f"{self.key} takes a single value.")
        if self.type is FilterType.BOOLEAN:
            value = parts[0].lower()
            if value in _TRUE:
                return True
            if value in _FALSE:
                return False
            raise FilterError(f"{self.key} must be true or false.")
        return self._parse_id(parts[0])

    def _parse_id(self, text: str) -> int:
        """Parses one id: a non-negative whole number that fits in a bigint.

        Args:
            text: The raw value, already stripped.

        Returns:
            The id.

        Raises:
            FilterError: It isn't a valid id.

        Usage:
            self._parse_id("12")  # 12
        """
        if not _ID_PATTERN.fullmatch(text) or int(text) > MAX_ID:
            raise FilterError(f"{self.key} must be a whole-number id.")
        return int(text)

    def to_json(self, options: Sequence[FilterOption] = ()) -> dict[str, Any]:
        """Serializes for the manifest.

        Args:
            options: The choices for a select or multiselect (from ``Layer.options``).

        Returns:
            ``{"key", "label", "type"}``, plus ``options`` unless it's a boolean.

        Usage:
            definition.to_json([FilterOption(1, "Weather")])
        """
        data: dict[str, Any] = {"key": self.key, "label": self.label, "type": str(self.type)}
        if self.type is not FilterType.BOOLEAN:
            data["options"] = [option.to_json() for option in options]
        return data


@dataclass(frozen=True)
class StyleValue:
    """One value a ``style_by`` property can take, e.g. a role.

    Attributes:
        value: The value as it appears in ``feature.properties[style_by.property]``.
        label: The legend label for it.
    """

    value: int
    label: str

    def to_json(self) -> dict[str, Any]:
        """Serializes for the manifest.

        Returns:
            ``{"value": ..., "label": ...}``.

        Usage:
            StyleValue(1, "Owner").to_json()
        """
        return {"value": self.value, "label": self.label}


@dataclass(frozen=True)
class StyleBy:
    """Colors markers by the values of one feature property while a filter is set.

    Attributes:
        property: A feature property holding a list of values, e.g. ``"roles"``.
        label: The legend's heading, e.g. ``"Role"``.
        active_when: The filter key that turns the coloring on, e.g. ``"organization"``.
        fallback_label: The legend label for features whose list is empty.

    The values themselves come from ``Layer.options``.
    """

    property: str
    label: str
    active_when: str
    fallback_label: str

    def to_json(self, values: Sequence[StyleValue] = ()) -> dict[str, Any]:
        """Serializes for the manifest.

        Args:
            values: The possible values, in color order.

        Returns:
            The style_by object from the API contract.

        Usage:
            style_by.to_json([StyleValue(1, "Owner")])
        """
        return {
            "property": self.property,
            "label": self.label,
            "active_when": self.active_when,
            "values": [value.to_json() for value in values],
            "fallback_label": self.fallback_label,
        }


@dataclass(frozen=True)
class LayerOptions:
    """The database-backed parts of a layer's manifest entry.

    Attributes:
        filters: Options for each select or multiselect filter, by filter key.
        style_values: The ``style_by`` values, in color order.
    """

    filters: Mapping[str, Sequence[FilterOption]] = field(default_factory=dict)
    style_values: Sequence[StyleValue] = ()


# ---------------------------------------------------------------------------------------
# Detail types
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class DetailField:
    """A label/value pair in a detail section.

    Attributes:
        label: The field's label.
        value: A display-ready value.
    """

    label: str
    value: Any

    def to_json(self) -> dict[str, Any]:
        """Serializes for the detail response.

        Returns:
            ``{"label": ..., "value": ...}``.

        Usage:
            DetailField("Code", "TS1").to_json()
        """
        return {"label": self.label, "value": self.value}


@dataclass(frozen=True)
class DetailSection:
    """A titled block in a detail view, with either fields or table rows.

    Attributes:
        title: The section heading.
        fields: Label/value pairs, or None for a table.
        rows: Table rows (column label to value), or None for fields.

    Raises:
        ValueError: Unless exactly one of ``fields`` and ``rows`` is given.
    """

    title: str
    fields: Sequence[DetailField] | None = None
    rows: Sequence[Mapping[str, Any]] | None = None

    def __post_init__(self) -> None:
        """Checks that the section has fields or rows, not both.

        Raises:
            ValueError: Both or neither were given.

        Usage:
            DetailSection("Overview")  # raises ValueError
        """
        if (self.fields is None) == (self.rows is None):
            raise ValueError("A DetailSection has either fields or rows.")

    def to_json(self) -> dict[str, Any]:
        """Serializes for the detail response.

        Returns:
            ``{"title", "fields"}`` or ``{"title", "rows"}``.

        Usage:
            DetailSection("Overview", fields=[DetailField("Code", "TS1")]).to_json()
        """
        if self.fields is not None:
            return {"title": self.title, "fields": [f.to_json() for f in self.fields]}
        return {"title": self.title, "rows": [dict(row) for row in self.rows]}


@dataclass(frozen=True)
class Link:
    """An external link in a detail view.

    Attributes:
        label: The link text.
        url: The target URL.
    """

    label: str
    url: str

    def to_json(self) -> dict[str, Any]:
        """Serializes for the detail response.

        Returns:
            ``{"label": ..., "url": ...}``.

        Usage:
            Link("MesoWest", "https://...").to_json()
        """
        return {"label": self.label, "url": self.url}


@dataclass(frozen=True)
class Detail:
    """Everything shown about one feature in a detail view.

    Attributes:
        id: The feature's id.
        title: The heading.
        sections: Field or table sections, in order.
        links: External links.
        data: Raw values for custom frontend components. The same masking rules apply.
    """

    id: int
    title: str
    sections: Sequence[DetailSection] = ()
    links: Sequence[Link] = ()
    data: Mapping[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        """Serializes for the detail response.

        Returns:
            The detail object from the API contract.

        Usage:
            layer.detail(db, 12).to_json()
        """
        return {
            "id": self.id,
            "title": self.title,
            "sections": [section.to_json() for section in self.sections],
            "links": [link.to_json() for link in self.links],
            "data": dict(self.data),
        }


# ---------------------------------------------------------------------------------------
# The Layer protocol
# ---------------------------------------------------------------------------------------


class Layer(Protocol):
    """One set of things drawn on the map. Implement it in ``layers/<name>.py``.

    Attributes:
        id: URL-safe identifier, e.g. ``"stations"``.
        title: Display name.
        default_visible: Whether the map draws it on load.
        location_note: Shown in popups, e.g. ``"Approximate location"``, or None.
        muted_label: Legend label for features with ``muted: true``, or None.
        popup_fields: Properties shown in the marker popup, in order.
        filters: Filters its features route accepts, in panel order.
        style_by: How markers are colored, or None.
    """

    id: str
    title: str
    default_visible: bool
    location_note: str | None
    muted_label: str | None
    popup_fields: Sequence[PopupField]
    filters: Sequence[FilterDef]
    style_by: StyleBy | None

    def options(self, db: Database) -> LayerOptions:
        """Reads the filter options and style_by values for the manifest.

        Args:
            db: The database.

        Returns:
            The options. A layer with no select filters and no style_by returns
            ``LayerOptions()`` without touching ``db``.

        Usage:
            layer.options(get_database())
        """
        ...

    def features(self, db: Database, filters: Mapping[str, FilterValue]) -> list[dict]:
        """Returns the layer's features for the given filters.

        Args:
            db: The database.
            filters: Every key in ``self.filters``, parsed. None means no filter.

        Returns:
            GeoJSON Feature dicts (see ``point_feature``), with masked coordinates.

        Usage:
            layer.features(db, {"project": 4, "station_type": None})
        """
        ...

    def detail(self, db: Database, feature_id: int) -> Detail | None:
        """Returns one feature's detail.

        Args:
            db: The database.
            feature_id: The feature's id.

        Returns:
            The Detail, or None if there's no such feature (the route returns 404).

        Usage:
            layer.detail(db, 12)
        """
        ...


# ---------------------------------------------------------------------------------------
# Helpers used by the API and by layers
# ---------------------------------------------------------------------------------------


def parse_filters(definitions: Sequence[FilterDef], args: MultiDict) -> dict[str, FilterValue]:
    """Parses and validates a features request's query parameters.

    Args:
        definitions: The layer's filters.
        args: The request's query parameters (``request.args``).

    Returns:
        Every filter key, mapped to its parsed value or None.

    Raises:
        FilterError: A parameter isn't one of the layer's filters, or a value is
            invalid. The message names the parameter and is safe to show.

    Usage:
        parse_filters(layer.filters, request.args)
    """
    by_key = {definition.key: definition for definition in definitions}
    unknown = sorted(set(args) - set(by_key))
    if unknown:
        raise FilterError(f"Unknown filter: {', '.join(unknown)}.")
    return {key: definition.parse(args.getlist(key)) for key, definition in by_key.items()}


def build_manifest_entry(layer: Layer, db: Database) -> dict[str, Any]:
    """Builds a layer's manifest entry, reading its options from the database.

    Args:
        layer: The layer.
        db: The database, passed to ``layer.options``.

    Returns:
        The manifest entry from the API contract. ``location_note``, ``muted_label``,
        and ``style_by`` are left out when the layer doesn't set them.

    Raises:
        ValueError: ``layer.options`` returned options for a filter the layer doesn't
            have, or for a boolean filter. That's a bug in the layer.

    Usage:
        build_manifest_entry(layer, get_database())
    """
    options = layer.options(db)
    choice_keys = {f.key for f in layer.filters if f.type is not FilterType.BOOLEAN}
    stray = sorted(set(options.filters) - choice_keys)
    if stray:
        raise ValueError(f"Layer {layer.id!r} returned options for unknown filters: {stray}")

    entry: dict[str, Any] = {
        "id": layer.id,
        "title": layer.title,
        "default_visible": layer.default_visible,
    }
    if layer.location_note is not None:
        entry["location_note"] = layer.location_note
    if layer.muted_label is not None:
        entry["muted_label"] = layer.muted_label
    entry["popup_fields"] = [popup.to_json() for popup in layer.popup_fields]
    entry["filters"] = [f.to_json(options.filters.get(f.key, ())) for f in layer.filters]
    if layer.style_by is not None:
        entry["style_by"] = layer.style_by.to_json(options.style_values)
    return entry


def point_feature(
    feature_id: int, lon: float, lat: float, properties: Mapping[str, Any]
) -> dict[str, Any]:
    """Builds a GeoJSON Point Feature.

    Args:
        feature_id: The feature's id.
        lon: Longitude. For sensitive points, the masked value from the database.
        lat: Latitude, likewise.
        properties: Flat, display-ready properties.

    Returns:
        A GeoJSON Feature dict.

    Usage:
        point_feature(12, -135.3412, 57.0531, {"name": "Sitka Harbor"})
    """
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": dict(properties),
    }


def feature_collection(features: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Wraps features in a GeoJSON FeatureCollection.

    Args:
        features: GeoJSON Feature dicts.

    Returns:
        ``{"type": "FeatureCollection", "features": [...]}``.

    Usage:
        feature_collection(layer.features(db, filters))
    """
    return {"type": "FeatureCollection", "features": list(features)}
