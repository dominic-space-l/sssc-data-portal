"""The map API's routes, as a Flask Blueprint mounted at ``/api``.

Role: holds every HTTP route. The layer routes are generic: they work with whatever
layers are registered (``backend.layers``) through the ``Layer`` protocol, and with the
database only through ``backend.db.get_database()``. Failures are raised, and
``backend.errors`` turns them into JSON.

Routes (all GET):
    /api/health                                {"status": "ok"}
    /api/layers                                {"layers": [manifest entry, ...]}
    /api/layers/<layer>/features?<filters>     GeoJSON FeatureCollection
    /api/layers/<layer>/features/<int:id>      Detail, or 404

Usage:
    app.register_blueprint(api)   # create_app does this
    curl 'http://localhost:5001/api/layers/stations/features?station_type=1,2'
"""

from flask import Blueprint, abort, request

from backend.db import get_database
from backend.layers import get_layer, get_layers
from backend.layers.base import (
    FilterError,
    Layer,
    build_manifest_entry,
    feature_collection,
    parse_filters,
)

api = Blueprint("api", __name__, url_prefix="/api")


@api.get("/health")
def health():
    """Reports that the API is up.

    Args:
        None.

    Returns:
        JSON ``{"status": "ok"}`` with HTTP 200. It doesn't need Supabase.

    Usage:
        curl http://localhost:5001/api/health
    """
    return {"status": "ok"}


@api.get("/layers")
def layers():
    """Returns the manifest: every layer, with its filters, popup fields, and style.

    Returns:
        ``{"layers": [...]}``, in registry order. With no layers registered, the
        database isn't touched.

    Usage:
        curl http://localhost:5001/api/layers
    """
    registered = get_layers()
    if not registered:
        return {"layers": []}
    db = get_database()
    return {"layers": [build_manifest_entry(layer, db) for layer in registered]}


@api.get("/layers/<layer_id>/features")
def features(layer_id: str):
    """Returns a layer's features, filtered by the query parameters.

    Args:
        layer_id: The layer's id.

    Returns:
        A GeoJSON FeatureCollection.

    Raises:
        NotFound: No layer has that id (404).
        BadRequest: A query parameter is unknown or invalid (400).

    Usage:
        curl 'http://localhost:5001/api/layers/stations/features?project=4'
    """
    layer = _require_layer(layer_id)
    try:
        filters = parse_filters(layer.filters, request.args)
    except FilterError as err:
        abort(400, description=str(err))
    return feature_collection(layer.features(get_database(), filters))


@api.get("/layers/<layer_id>/features/<int:feature_id>")
def feature_detail(layer_id: str, feature_id: int):
    """Returns one feature's detail.

    Args:
        layer_id: The layer's id.
        feature_id: The feature's id. A non-integer id doesn't match this route (404).

    Returns:
        The feature's Detail as JSON.

    Raises:
        NotFound: No such layer or feature (404).

    Usage:
        curl http://localhost:5001/api/layers/stations/features/12
    """
    layer = _require_layer(layer_id)
    detail = layer.detail(get_database(), feature_id)
    if detail is None:
        abort(404, description="No feature with that id in this layer.")
    return detail.to_json()


def _require_layer(layer_id: str) -> Layer:
    """Looks up a layer, or ends the request with a 404.

    Args:
        layer_id: The id from the URL.

    Returns:
        The layer.

    Raises:
        NotFound: No layer has that id.

    Usage:
        layer = _require_layer(layer_id)
    """
    layer = get_layer(layer_id)
    if layer is None:
        abort(404, description="No layer with that id.")
    return layer
