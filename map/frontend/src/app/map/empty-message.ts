/**
 * @fileoverview The message shown when a layer comes back with no features.
 *
 * Generic: built from the layer's title and filters, so a stations layer says "No
 * stations match these filters" without this code knowing about stations. When the
 * selected option of a select filter carries a hint (a project tagged "No stations"),
 * the message names that option instead, since it explains the empty result.
 *
 * Usage: `emptyMessage(layer, state.filtersFor(layer.id))`
 */

import { FilterOption, FilterValues, LayerManifest } from '../core/models';

/**
 * Builds the empty-state message for a layer.
 *
 * Usage: `emptyMessage(stationsLayer, { project: 7 })`
 *
 * @param layer The layer's manifest entry.
 * @param filters Its current filter values.
 * @return "No <things> are associated with <option>." when a selected option has a
 *     hint, "No <things> match these filters." when another filter is set, and
 *     "No <things> to show." otherwise.
 */
export function emptyMessage(layer: LayerManifest, filters: FilterValues): string {
  const things = layer.title.toLowerCase();
  const hinted = selectedHintedOption(layer, filters);
  if (hinted) {
    return `No ${things} are associated with ${hinted.label}.`;
  }
  const filtered = Object.values(filters).some((value) => value !== null && value !== undefined);
  return filtered ? `No ${things} match these filters.` : `No ${things} to show.`;
}

/**
 * Finds the selected option of a select filter, if that option has a hint.
 *
 * @param layer The layer's manifest entry.
 * @param filters Its current filter values.
 * @return The first such option, or undefined.
 */
function selectedHintedOption(
  layer: LayerManifest,
  filters: FilterValues,
): FilterOption | undefined {
  for (const filter of layer.filters) {
    const value = filters[filter.key];
    if (filter.type !== 'select' || typeof value !== 'number') {
      continue;
    }
    const option = filter.options?.find((o) => o.value === value);
    if (option?.hint) {
      return option;
    }
  }
  return undefined;
}
