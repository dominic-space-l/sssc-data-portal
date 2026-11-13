/**
 * @fileoverview Marker factory: turns a feature's style into a Leaflet marker.
 *
 * Markers are `L.marker`s with an inline-SVG `divIcon`, so they can be focused and
 * opened from the keyboard and carry a `title`. Muted markers (inactive stations) are
 * drawn at reduced opacity with a gray outline, so any fill color stays readable. Map
 * commit 15 adds segmented (per-role) markers here.
 *
 * Usage:
 *   const marker = createMarker([57.05, -135.33], styleFor('stations'), {
 *     title: 'Test Station 1',
 *     muted: false,
 *   });
 */

import * as L from 'leaflet';
import { LayerStyle } from './registry';

/** Outline of a normal marker: white, so it stands out on any base map. */
export const OUTLINE_COLOR = '#ffffff';
/** Outline of a muted marker. */
export const MUTED_OUTLINE_COLOR = '#757575';
/** Opacity of a muted marker. */
export const MUTED_OPACITY = 0.5;

const OUTLINE_WIDTH = 2;

/** What varies per feature. */
export interface MarkerOptions {
  /** Tooltip and accessible name, such as the station name. */
  readonly title: string;
  /** Whether to grey the marker out. */
  readonly muted?: boolean;
}

/**
 * Builds a circular marker.
 *
 * Usage: `createMarker([lat, lon], style, { title: name, muted: true }).addTo(map)`
 *
 * @param latLng Where to draw it.
 * @param style The layer's style (color and radius).
 * @param options The marker's title and whether it's muted.
 * @return A Leaflet marker, not yet added to a map.
 */
export function createMarker(
  latLng: L.LatLngExpression,
  style: LayerStyle,
  options: MarkerOptions,
): L.Marker {
  const size = 2 * (style.radius + OUTLINE_WIDTH);
  return L.marker(latLng, {
    icon: L.divIcon({
      className: options.muted ? 'map-marker map-marker--muted' : 'map-marker',
      html: circleSvg(style, size, options.muted ?? false),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    }),
    title: options.title,
    alt: options.title,
    keyboard: true,
    riseOnHover: true,
  });
}

/**
 * Draws the marker's SVG. Only style values (developer-controlled constants) go into
 * the markup; feature data never does.
 *
 * @param style The layer's style.
 * @param size The SVG's width and height in pixels.
 * @param muted Whether to grey it out.
 * @return SVG markup.
 */
function circleSvg(style: LayerStyle, size: number, muted: boolean): string {
  const center = size / 2;
  const outline = muted ? MUTED_OUTLINE_COLOR : OUTLINE_COLOR;
  const opacity = muted ? MUTED_OPACITY : 1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" aria-hidden="true" opacity="${opacity}">` +
    `<circle cx="${center}" cy="${center}" r="${style.radius}" fill="${style.color}" ` +
    `stroke="${outline}" stroke-width="${OUTLINE_WIDTH}"/></svg>`
  );
}
