"""Test doubles for the map backend: a fake database and a fake layer.

Role: lets the generic API and the layer framework be tested without Supabase or a
real layer. ``FakeDatabase`` returns canned rpc results (or raises canned errors) and
records every call. ``FakeLayer`` is a complete layer, with one filter of each type and
a style_by, that reads from a FakeDatabase.

Usage:
    from fakes import FakeDatabase, FakeLayer
    db = FakeDatabase({"fake_features": rows})
    app = create_app(Config(), db, [FakeLayer()])
"""

from collections.abc import Mapping
from typing import Any

from backend.layers.base import (
    Detail,
    DetailField,
    DetailSection,
    FilterDef,
    FilterOption,
    FilterType,
    LayerOptions,
    PopupField,
    StyleBy,
    StyleValue,
    point_feature,
)


class FakeDatabase:
    """A Database whose rpc results are canned, recording every call.

    Attributes:
        results: Function name to the result to return, or an exception to raise.
        calls: ``(name, params)`` for each call, in order.

    Usage:
        db = FakeDatabase({"map_stations": [...]})
        db = FakeDatabase({"map_stations": MaskingUnavailableError("...")})
    """

    def __init__(self, results: Mapping[str, Any] | None = None):
        """Stores the canned results.

        Args:
            results: Function name to result or exception. Unknown names return [].

        Usage:
            FakeDatabase({"fake_options": {...}})
        """
        self.results = dict(results or {})
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: Mapping[str, Any] | None = None) -> Any:
        """Records the call, then returns or raises the canned result.

        Args:
            name: Function name.
            params: Named arguments.

        Returns:
            The canned result, or [] if there is none.

        Raises:
            Exception: The canned exception, if one was given for ``name``.

        Usage:
            db.rpc("fake_features", {"kind": [1]})
        """
        self.calls.append((name, dict(params or {})))
        result = self.results.get(name, [])
        if isinstance(result, BaseException):
            raise result
        return result


class FakeLayer:
    """A complete layer for testing the generic API, backed by FakeDatabase.

    It has one filter of each type and a style_by. ``options`` reads ``fake_options``,
    ``features`` reads ``fake_features`` (rows with id, lon, lat, name, tags), and
    ``detail`` returns a Detail for ids found in those rows.

    Usage:
        create_app(Config(), FakeDatabase({"fake_features": rows}), [FakeLayer()])
    """

    def __init__(self, layer_id: str = "fake"):
        """Sets the static parts of the layer.

        Args:
            layer_id: The layer's id.

        Usage:
            FakeLayer("other")
        """
        self.id = layer_id
        self.title = "Fake things"
        self.default_visible = True
        self.location_note = "Approximate location"
        self.muted_label = "Inactive"
        self.popup_fields = (PopupField("name", "Name"),)
        self.filters = (
            FilterDef("group", "Group", FilterType.SELECT),
            FilterDef("kind", "Kind", FilterType.MULTISELECT),
            FilterDef("live", "Live only", FilterType.BOOLEAN),
        )
        self.style_by = StyleBy("tags", "Tag", "group", "No tag")

    def options(self, db):
        """Reads ``fake_options``: ``{"groups": [[id, name, implies]], "tags": [...]}``.

        Args:
            db: The database.

        Returns:
            LayerOptions for ``group`` and ``kind`` (``kind`` uses the same tags).

        Usage:
            FakeLayer().options(db)
        """
        data = db.rpc("fake_options")
        groups = [
            FilterOption(value, label, implies=implies, hint=hint)
            for value, label, implies, hint in data.get("groups", [])
        ]
        tags = [StyleValue(value, label) for value, label in data.get("tags", [])]
        kinds = [FilterOption(tag.value, tag.label) for tag in tags]
        return LayerOptions(filters={"group": groups, "kind": kinds}, style_values=tags)

    def features(self, db, filters):
        """Reads ``fake_features``, passing the parsed filters as params.

        Args:
            db: The database.
            filters: The parsed filters.

        Returns:
            Point features.

        Usage:
            FakeLayer().features(db, {"group": None, "kind": None, "live": None})
        """
        rows = db.rpc("fake_features", dict(filters))
        return [
            point_feature(row["id"], row["lon"], row["lat"], {"name": row["name"]}) for row in rows
        ]

    def detail(self, db, feature_id):
        """Returns a Detail for a feature in ``fake_features``, or None.

        Args:
            db: The database.
            feature_id: The id.

        Returns:
            A Detail with one Overview section, or None.

        Usage:
            FakeLayer().detail(db, 1)
        """
        for row in db.rpc("fake_features", {"id": feature_id}):
            if row["id"] == feature_id:
                fields = [DetailField("Name", row["name"])]
                return Detail(row["id"], row["name"], [DetailSection("Overview", fields)])
        return None
