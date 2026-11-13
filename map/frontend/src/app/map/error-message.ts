/**
 * @fileoverview The messages shown when the manifest or a layer fails to load.
 *
 * Each message says what failed, then the backend's own explanation from
 * `describeApiError`. For example, a 503 while masking is unavailable reads "Stations
 * couldn't be loaded. Station locations are temporarily unavailable.", and an
 * unreachable backend reads "... The map server could not be reached."
 *
 * Usage: `layerErrorMessage(layer, load.error)`
 */

import { ApiError, LayerManifest } from '../core/models';

/**
 * Builds the message for a manifest that failed to load.
 *
 * Usage: `manifestErrorMessage(state.manifestError()!)`
 *
 * @param error The failure.
 * @return The message.
 */
export function manifestErrorMessage(error: ApiError): string {
  return `The map couldn't load its layers. ${error.message}`;
}

/**
 * Builds the message for a layer whose features failed to load.
 *
 * Usage: `layerErrorMessage(stationsLayer, error)`
 *
 * @param layer The layer's manifest entry.
 * @param error The failure.
 * @return The message.
 */
export function layerErrorMessage(layer: LayerManifest, error: ApiError): string {
  return `${layer.title} couldn't be loaded. ${error.message}`;
}
