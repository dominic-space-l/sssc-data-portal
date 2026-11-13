/**
 * @fileoverview Per-layer marker styles: the only layer-specific code in the frontend.
 *
 * Everything about a layer's content comes from the backend manifest. This file only
 * says how its markers look: a base style per layer id, and the palette for a layer's
 * `style_by` values (role colors). A layer without an entry gets `DEFAULT_STYLE` and the
 * Okabe–Ito palette, so a new backend layer shows up without frontend changes.
 *
 * Usage:
 *   const style = styleFor('stations');
 *   const color = styleByColor('stations', 0, 'Owner');
 */

/** How a layer's markers are drawn when no `style_by` coloring is active. */
export interface LayerStyle {
  /** Fill color of the marker. */
  readonly color: string;
  /** Marker radius in pixels. */
  readonly radius: number;
}

/** Used for any layer without its own entry. */
export const DEFAULT_STYLE: LayerStyle = { color: '#555555', radius: 7 };

/**
 * The Okabe–Ito palette, which stays distinguishable with the common forms of color
 * blindness. `style_by` values take these in order (RoleID order for roles).
 */
export const OKABE_ITO: readonly string[] = [
  '#E69F00', // orange
  '#56B4E9', // sky blue
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#000000', // black
];

/** Color for a feature with none of the `style_by` values (no role with the organization). */
export const FALLBACK_COLOR = '#9E9E9E';

/** Base style overrides by layer id. */
const LAYER_STYLES: Readonly<Record<string, Partial<LayerStyle>>> = {
  stations: { color: '#1d4e89' },
};

/**
 * Fixed colors for particular `style_by` values, by layer id, then by value label (for
 * example a role title). Values not listed take the next palette color. Empty for now:
 * add an entry to pin a role's color, e.g. `stations: { Owner: '#0072B2' }`.
 */
const STYLE_BY_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};

/**
 * Returns a layer's marker style: its overrides on top of the default.
 *
 * Usage: `styleFor('stations').color`
 *
 * @param layerId The layer's id from the manifest.
 * @return The full style.
 */
export function styleFor(layerId: string): LayerStyle {
  return { ...DEFAULT_STYLE, ...LAYER_STYLES[layerId] };
}

/**
 * Returns the color of one `style_by` value.
 *
 * Usage: `styleByColor('stations', 0, 'Owner')`
 *
 * @param layerId The layer's id.
 * @param index The value's position in `style_by.values` (its color order).
 * @param label The value's label, checked against the layer's overrides.
 * @return An override if one is set, otherwise the palette color at `index`, cycling
 *     when there are more values than colors.
 */
export function styleByColor(layerId: string, index: number, label: string): string {
  return STYLE_BY_OVERRIDES[layerId]?.[label] ?? OKABE_ITO[index % OKABE_ITO.length];
}
