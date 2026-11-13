"""Tests for backend.layers.base: filter parsing, serialization, and the manifest.

Role: checks that query parameters are parsed and validated per filter type (invalid
values become a FilterError, which the API returns as 400), that every type serializes
to the shape in the API contract, and that manifest entries are built correctly from a
layer and its database-backed options.

Usage:
    uv run pytest tests/test_layer_base.py      # from map/backend/
"""

import pytest
from fakes import FakeDatabase, FakeLayer
from werkzeug.datastructures import MultiDict

from backend.layers.base import (
    MAX_ID,
    MAX_MULTISELECT_VALUES,
    Detail,
    DetailField,
    DetailSection,
    FilterDef,
    FilterError,
    FilterOption,
    FilterType,
    LayerOptions,
    Link,
    StyleBy,
    StyleValue,
    build_manifest_entry,
    feature_collection,
    parse_filters,
    point_feature,
)

SELECT = FilterDef("project", "Project", FilterType.SELECT)
MULTI = FilterDef("station_type", "Station type", FilterType.MULTISELECT)
BOOLEAN = FilterDef("active", "Active only", FilterType.BOOLEAN)


# ---------------------------------------------------------------------------------------
# FilterDef.parse
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("raw", [[], [""], ["  "]], ids=["absent", "empty", "blank"])
@pytest.mark.parametrize("definition", [SELECT, MULTI, BOOLEAN], ids=lambda d: str(d.type))
def test_no_value_means_no_filter(definition, raw):
    """An absent or blank parameter parses to None for every type.

    Args:
        definition: A filter of each type.
        raw: No usable value.

    Usage:
        uv run pytest -k no_value
    """
    assert definition.parse(raw) is None


def test_select_parses_one_id():
    """A select takes one whole-number id, with surrounding whitespace ignored.

    Usage:
        uv run pytest -k select_parses
    """
    assert SELECT.parse(["4"]) == 4
    assert SELECT.parse([" 7 "]) == 7
    assert SELECT.parse([str(MAX_ID)]) == MAX_ID


@pytest.mark.parametrize(
    "value",
    ["abc", "-1", "1.5", "1e3", "0x10", "٣", str(MAX_ID + 1), "9" * 25],
    ids=["text", "negative", "decimal", "exponent", "hex", "arabic-digit", "max+1", "huge"],
)
def test_invalid_ids_are_refused(value):
    """Anything but ASCII digits within bigint range is a FilterError naming the key.

    Args:
        value: An invalid id.

    Usage:
        uv run pytest -k invalid_ids
    """
    with pytest.raises(FilterError, match="project must be a whole-number id"):
        SELECT.parse([value])
    with pytest.raises(FilterError, match="station_type must be a whole-number id"):
        MULTI.parse(["1", value])


def test_select_refuses_two_values():
    """A single-value filter given twice is an error, not a silent pick.

    Usage:
        uv run pytest -k refuses_two
    """
    with pytest.raises(FilterError, match="single value"):
        SELECT.parse(["1", "2"])


def test_multiselect_accepts_repeated_and_comma_separated_values():
    """Repeated parameters and comma lists combine, blanks drop, duplicates collapse.

    Usage:
        uv run pytest -k repeated_and_comma
    """
    assert MULTI.parse(["3"]) == [3]
    assert MULTI.parse(["1", "2"]) == [1, 2]
    assert MULTI.parse(["2,1", "3"]) == [2, 1, 3]
    assert MULTI.parse(["1,,2,", " 2 ", "1"]) == [1, 2]


def test_multiselect_has_a_value_limit():
    """More than MAX_MULTISELECT_VALUES distinct ids is refused.

    Usage:
        uv run pytest -k value_limit
    """
    allowed = ",".join(str(i) for i in range(MAX_MULTISELECT_VALUES))
    assert len(MULTI.parse([allowed])) == MAX_MULTISELECT_VALUES
    with pytest.raises(FilterError, match="at most"):
        MULTI.parse([allowed + f",{MAX_MULTISELECT_VALUES}"])


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("true", True), ("TRUE", True), ("1", True), ("false", False), ("0", False)],
)
def test_boolean_values(raw, expected):
    """A boolean takes true/false or 1/0, in any case.

    Args:
        raw: The raw value.
        expected: The parsed value.

    Usage:
        uv run pytest -k boolean_values
    """
    assert BOOLEAN.parse([raw]) is expected


@pytest.mark.parametrize("raw", [["yes"], ["2"], ["true", "false"]])
def test_invalid_booleans_are_refused(raw):
    """Anything else, or two values, is a FilterError.

    Args:
        raw: Invalid raw values.

    Usage:
        uv run pytest -k invalid_booleans
    """
    with pytest.raises(FilterError, match="active"):
        BOOLEAN.parse(raw)


# ---------------------------------------------------------------------------------------
# parse_filters
# ---------------------------------------------------------------------------------------


def test_parse_filters_returns_every_key():
    """Every declared filter is in the result, None when it wasn't given.

    Usage:
        uv run pytest -k every_key
    """
    args = MultiDict([("station_type", "1"), ("station_type", "2"), ("project", "4")])
    assert parse_filters([SELECT, MULTI, BOOLEAN], args) == {
        "project": 4,
        "station_type": [1, 2],
        "active": None,
    }
    assert parse_filters([SELECT, MULTI], MultiDict()) == {"project": None, "station_type": None}


def test_parse_filters_refuses_unknown_parameters():
    """A parameter that isn't one of the layer's filters is an error listing them.

    Usage:
        uv run pytest -k unknown_parameters
    """
    with pytest.raises(FilterError, match="Unknown filter: color, size."):
        parse_filters([SELECT], MultiDict([("size", "1"), ("color", "2"), ("project", "1")]))


# ---------------------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------------------


def test_filter_option_leaves_out_unset_keys():
    """Optional implies and hint appear only when set.

    Usage:
        uv run pytest -k unset_keys
    """
    assert FilterOption(1, "Weather").to_json() == {"value": 1, "label": "Weather"}
    assert FilterOption(
        7, "Snow Survey", implies={"organization": 5}, hint="No stations"
    ).to_json() == {
        "value": 7,
        "label": "Snow Survey",
        "implies": {"organization": 5},
        "hint": "No stations",
    }


def test_filter_def_json_by_type():
    """Select and multiselect filters list their options. Booleans have none.

    Usage:
        uv run pytest -k json_by_type
    """
    assert SELECT.to_json([FilterOption(4, "Tide Gauges")]) == {
        "key": "project",
        "label": "Project",
        "type": "select",
        "options": [{"value": 4, "label": "Tide Gauges"}],
    }
    assert MULTI.to_json() == {
        "key": "station_type",
        "label": "Station type",
        "type": "multiselect",
        "options": [],
    }
    assert BOOLEAN.to_json() == {"key": "active", "label": "Active only", "type": "boolean"}


def test_style_by_json():
    """style_by serializes with its values, as in the API contract.

    Usage:
        uv run pytest -k style_by_json
    """
    style = StyleBy("roles", "Role", "organization", "No role with this organization")
    assert style.to_json([StyleValue(1, "Owner"), StyleValue(2, "Maintainer")]) == {
        "property": "roles",
        "label": "Role",
        "active_when": "organization",
        "values": [{"value": 1, "label": "Owner"}, {"value": 2, "label": "Maintainer"}],
        "fallback_label": "No role with this organization",
    }


def test_detail_json():
    """A Detail serializes with fields and table sections, links, and data.

    Usage:
        uv run pytest -k detail_json
    """
    detail = Detail(
        12,
        "Sitka Harbor",
        [
            DetailSection("Overview", fields=[DetailField("Installed", "2019-06-01")]),
            DetailSection("Sensors", rows=[{"Sensor": "Anemometer", "Height (m)": 10}]),
        ],
        [Link("MesoWest", "https://example.org")],
        {"code": "SHB01"},
    )
    assert detail.to_json() == {
        "id": 12,
        "title": "Sitka Harbor",
        "sections": [
            {"title": "Overview", "fields": [{"label": "Installed", "value": "2019-06-01"}]},
            {"title": "Sensors", "rows": [{"Sensor": "Anemometer", "Height (m)": 10}]},
        ],
        "links": [{"label": "MesoWest", "url": "https://example.org"}],
        "data": {"code": "SHB01"},
    }


@pytest.mark.parametrize("kwargs", [{}, {"fields": [], "rows": []}], ids=["neither", "both"])
def test_detail_section_needs_fields_or_rows(kwargs):
    """A section has exactly one of fields and rows.

    Args:
        kwargs: Neither, or both.

    Usage:
        uv run pytest -k fields_or_rows
    """
    with pytest.raises(ValueError, match="either fields or rows"):
        DetailSection("Overview", **kwargs)


def test_point_feature_and_collection():
    """point_feature builds a GeoJSON Point Feature, and feature_collection wraps them.

    Usage:
        uv run pytest -k point_feature
    """
    feature = point_feature(12, -135.3412, 57.0531, {"name": "Sitka Harbor", "muted": True})
    assert feature == {
        "type": "Feature",
        "id": 12,
        "geometry": {"type": "Point", "coordinates": [-135.3412, 57.0531]},
        "properties": {"name": "Sitka Harbor", "muted": True},
    }
    assert feature_collection([feature]) == {"type": "FeatureCollection", "features": [feature]}
    assert feature_collection([]) == {"type": "FeatureCollection", "features": []}


# ---------------------------------------------------------------------------------------
# build_manifest_entry
# ---------------------------------------------------------------------------------------

FAKE_OPTIONS = {
    "groups": [[4, "Group A", {"group": 4}, None], [7, "Group B", None, "Empty"]],
    "tags": [[1, "Red"], [2, "Blue"]],
}


def test_manifest_entry_combines_static_and_database_parts():
    """The entry has the layer's static description and its options, in contract shape.

    Usage:
        uv run pytest -k combines
    """
    db = FakeDatabase({"fake_options": FAKE_OPTIONS})
    assert build_manifest_entry(FakeLayer(), db) == {
        "id": "fake",
        "title": "Fake things",
        "default_visible": True,
        "location_note": "Approximate location",
        "muted_label": "Inactive",
        "popup_fields": [{"key": "name", "label": "Name"}],
        "filters": [
            {
                "key": "group",
                "label": "Group",
                "type": "select",
                "options": [
                    {"value": 4, "label": "Group A", "implies": {"group": 4}},
                    {"value": 7, "label": "Group B", "hint": "Empty"},
                ],
            },
            {
                "key": "kind",
                "label": "Kind",
                "type": "multiselect",
                "options": [{"value": 1, "label": "Red"}, {"value": 2, "label": "Blue"}],
            },
            {"key": "live", "label": "Live only", "type": "boolean"},
        ],
        "style_by": {
            "property": "tags",
            "label": "Tag",
            "active_when": "group",
            "values": [{"value": 1, "label": "Red"}, {"value": 2, "label": "Blue"}],
            "fallback_label": "No tag",
        },
    }
    assert db.calls == [("fake_options", {})]


def test_manifest_entry_leaves_out_unset_optional_keys():
    """A layer without a note, muted label, or style_by has none of those keys.

    Usage:
        uv run pytest -k unset_optional
    """
    layer = FakeLayer()
    layer.location_note = None
    layer.muted_label = None
    layer.style_by = None
    entry = build_manifest_entry(layer, FakeDatabase({"fake_options": {}}))
    assert not {"location_note", "muted_label", "style_by"} & set(entry)
    assert entry["filters"][0]["options"] == []


class _StrayOptionsLayer(FakeLayer):
    """A buggy layer whose options name a filter it doesn't have."""

    def __init__(self, stray_key):
        """Sets which filter key the stray options use.

        Args:
            stray_key: ``"missing"`` (no such filter) or ``"live"`` (a boolean).

        Usage:
            _StrayOptionsLayer("missing")
        """
        super().__init__()
        self._stray_key = stray_key

    def options(self, db):
        """Returns options for the stray key.

        Args:
            db: Unused.

        Returns:
            LayerOptions with one stray entry.

        Usage:
            layer.options(db)
        """
        return LayerOptions(filters={self._stray_key: [FilterOption(1, "x")]})


@pytest.mark.parametrize("stray_key", ["missing", "live"], ids=["unknown-filter", "boolean"])
def test_options_for_filters_that_cant_have_them_are_a_bug(stray_key):
    """Options for an unknown or boolean filter raise, instead of being dropped.

    Args:
        stray_key: The filter key the buggy layer returns options for.

    Usage:
        uv run pytest -k are_a_bug
    """
    with pytest.raises(ValueError, match="unknown filters"):
        build_manifest_entry(_StrayOptionsLayer(stray_key), FakeDatabase())
