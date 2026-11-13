/**
 * @fileoverview The message shown when a layer comes back with no features.
 *
 * Generic: built from the layer's title, so a stations layer says "No stations match
 * these filters" without this code knowing about stations.
 *
 * Usage: `emptyMessage(layer, state.filtersFor(layer.id))`
 */

import { FilterValues, LayerManifest } from '../core/models';

/**
 * Builds the empty-state message for a layer.
 *
 * Usage: `emptyMessage(stationsLayer, { station_type: [2] })`
 *
 * @param layer The layer's manifest entry.
 * @param filters Its current filter values.
 * @return "No <things> match these filters." when a filter is set, and "No <things> to
 *     show." otherwise.
 */
export function emptyMessage(layer: LayerManifest, filters: FilterValues): string {
  const things = layer.title.toLowerCase();
  const filtered = Object.values(filters).some((value) => value !== null && value !== undefined);
  return filtered ? `No ${things} match these filters.` : `No ${things} to show.`;
}
