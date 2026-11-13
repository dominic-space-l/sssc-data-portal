"""The registry of map layers.

Role: lists every layer the API serves. Adding a layer means writing
``layers/<name>.py`` (implementing ``backend.layers.base.Layer``) and adding its
instance to ``REGISTRY``. The API and the frontend pick it up from there, with no
other changes. ``create_app`` copies the registry into the app, so tests can serve
fake layers instead.

Usage:
    from backend.layers import get_layer, get_layers
    layer = get_layer("stations")      # None if there's no such layer
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from flask import Flask, current_app

from backend.layers.base import Layer
from backend.layers.stations import STATIONS

# Every layer the API serves, in manifest order.
REGISTRY: tuple[Layer, ...] = (STATIONS,)

# Key in app.extensions for the app's layers, by id.
EXTENSION_KEY = "map_layers"

_LAYER_ID = re.compile(r"[a-z][a-z0-9_-]*")


def init_layers(app: Flask, layers: Sequence[Layer] | None = None) -> None:
    """Registers the layers an app serves.

    Args:
        app: The Flask app.
        layers: The layers, in manifest order. None means ``REGISTRY``.

    Raises:
        ValueError: Two layers share an id, or an id isn't URL-safe (lowercase
            letters, digits, ``-`` and ``_``, starting with a letter).

    Usage:
        init_layers(app)                 # create_app does this
        init_layers(app, [FakeLayer()])  # tests
    """
    layers = REGISTRY if layers is None else tuple(layers)
    by_id: dict[str, Layer] = {}
    for layer in layers:
        if not _LAYER_ID.fullmatch(layer.id):
            raise ValueError(f"Layer id {layer.id!r} must be lowercase and URL-safe.")
        if layer.id in by_id:
            raise ValueError(f"Two layers have the id {layer.id!r}.")
        by_id[layer.id] = layer
    app.extensions[EXTENSION_KEY] = by_id


def get_layers() -> list[Layer]:
    """Returns the current app's layers, in manifest order.

    Returns:
        The layers.

    Usage:
        Inside a request: ``for layer in get_layers(): ...``
    """
    return list(current_app.extensions[EXTENSION_KEY].values())


def get_layer(layer_id: str) -> Layer | None:
    """Finds one of the current app's layers by id.

    Args:
        layer_id: The id from the URL.

    Returns:
        The layer, or None if there isn't one with that id.

    Usage:
        Inside a request: ``get_layer("stations")``.
    """
    return current_app.extensions[EXTENSION_KEY].get(layer_id)
