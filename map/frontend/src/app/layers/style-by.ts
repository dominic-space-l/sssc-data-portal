/**
 * @fileoverview Applies a layer's `style_by`: when it's active, and which colors a feature gets.
 *
 * From the API contract: when the filter named by `style_by.active_when` has a value,
 * each marker is colored by the values in `properties[style_by.property]` (a list). One
 * value gives a solid marker, several give a pie with one slice each, and an empty list
 * uses the fallback color. Generic: nothing here knows about roles or organizations.
 *
 * Usage:
 *   if (isStyleByActive(layer, filters)) {
 *     const palette = styleByPalette(layer);
 *     const colors = featureColors(feature, layer, palette);
 *   }
 */

import { Feature, FilterValues, LayerManifest } from '../core/models';
import { FALLBACK_COLOR, styleByColor } from './registry';

/** One `style_by` value with its color, for markers and the legend. */
export interface StyleByEntry {
  readonly value: number;
  readonly label: string;
  readonly color: string;
}

/**
 * Whether a layer's `style_by` coloring applies.
 *
 * Usage: `isStyleByActive(layer, state.filtersFor(layer.id))`
 *
 * @param layer The layer's manifest entry.
 * @param filters Its current filter values.
 * @return True if the layer has a `style_by` and its `active_when` filter has a value.
 */
export function isStyleByActive(layer: LayerManifest, filters: FilterValues): boolean {
  if (!layer.style_by) {
    return false;
  }
  const value = filters[layer.style_by.active_when];
  return value !== null && value !== undefined;
}

/**
 * Lists a layer's `style_by` values with their colors, in color order.
 *
 * Usage: `styleByEntries(layer).map((e) => e.color)`
 *
 * @param layer The layer's manifest entry.
 * @return One entry per value, or none if the layer has no `style_by`.
 */
export function styleByEntries(layer: LayerManifest): readonly StyleByEntry[] {
  return (layer.style_by?.values ?? []).map((value, index) => ({
    value: value.value,
    label: value.label,
    color: styleByColor(layer.id, index, value.label),
  }));
}

/**
 * Maps each `style_by` value to its entry, for looking features up.
 *
 * Usage: `const palette = styleByPalette(layer);`
 *
 * @param layer The layer's manifest entry.
 * @return Value to entry.
 */
export function styleByPalette(layer: LayerManifest): ReadonlyMap<number, StyleByEntry> {
  return new Map(styleByEntries(layer).map((entry) => [entry.value, entry]));
}

/**
 * Returns the `style_by` entries a feature has, in the order its property lists them.
 *
 * @param feature The feature.
 * @param layer Its layer's manifest entry.
 * @param palette From `styleByPalette(layer)`.
 * @return The feature's entries. Values the palette doesn't know are skipped.
 */
export function featureEntries(
  feature: Feature,
  layer: LayerManifest,
  palette: ReadonlyMap<number, StyleByEntry>,
): readonly StyleByEntry[] {
  const raw = layer.style_by ? feature.properties[layer.style_by.property] : undefined;
  const values = Array.isArray(raw) ? (raw as unknown[]) : [];
  return values
    .map((value) => palette.get(value as number))
    .filter((entry): entry is StyleByEntry => entry !== undefined);
}

/**
 * Returns the colors to draw a feature with while `style_by` is active.
 *
 * Usage: `createMarker(latLng, style, { title, colors: featureColors(f, layer, palette) })`
 *
 * @param feature The feature.
 * @param layer Its layer's manifest entry.
 * @param palette From `styleByPalette(layer)`.
 * @return One color per value (a pie when several), or `[FALLBACK_COLOR]` when it has
 *     none.
 */
export function featureColors(
  feature: Feature,
  layer: LayerManifest,
  palette: ReadonlyMap<number, StyleByEntry>,
): readonly string[] {
  const colors = featureEntries(feature, layer, palette).map((entry) => entry.color);
  return colors.length > 0 ? colors : [FALLBACK_COLOR];
}
