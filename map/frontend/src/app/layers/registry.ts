/**
 * @fileoverview Per-layer marker styles: the only layer-specific code in the frontend.
 *
 * Everything about a layer's content comes from the backend manifest. This file only
 * says how its markers look. A layer without an entry gets `DEFAULT_STYLE`, so a new
 * backend layer shows up without frontend changes. Map commit 15 adds the `style_by`
 * palette (role colors) here.
 *
 * Usage: `const style = styleFor('stations');`
 */

/** How a layer's markers are drawn. */
export interface LayerStyle {
  /** Fill color of the marker. */
  readonly color: string;
  /** Marker radius in pixels. */
  readonly radius: number;
}

/** Used for any layer without its own entry. */
export const DEFAULT_STYLE: LayerStyle = { color: '#555555', radius: 7 };

/** Style overrides by layer id. */
const LAYER_STYLES: Readonly<Record<string, Partial<LayerStyle>>> = {
  stations: { color: '#1d4e89' },
};

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
