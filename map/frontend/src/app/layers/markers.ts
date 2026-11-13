/**
 * @fileoverview Marker factory: turns a feature's style into a Leaflet marker.
 *
 * Markers are `L.marker`s with an inline-SVG `divIcon`, so they can be focused and
 * opened from the keyboard and carry a `title`. A marker is a solid circle in the
 * layer's color, or, when `style_by` coloring is active, in its value's color. With
 * several values it's a pie with one equal slice per value, in order. Muted markers
 * (inactive stations) are drawn at reduced opacity with a gray outline, keeping their
 * colors so slices stay readable.
 *
 * Usage:
 *   const marker = createMarker([57.05, -135.33], styleFor('stations'), {
 *     title: 'Test Station 1',
 *     muted: false,
 *     colors: ['#E69F00', '#0072B2'],   // optional: a two-slice pie
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
/** Width of the white line between pie slices. */
const SLICE_GAP_WIDTH = 1;

/** What varies per feature. */
export interface MarkerOptions {
  /** Tooltip and accessible name, such as the station name. */
  readonly title: string;
  /** Whether to grey the marker out. */
  readonly muted?: boolean;
  /**
   * Fill colors: one for a solid marker, several for a pie. Omitted or empty means the
   * layer's color. Only palette constants may be passed, never feature data.
   */
  readonly colors?: readonly string[];
}

/**
 * Builds a circular or pie marker.
 *
 * Usage: `createMarker([lat, lon], style, { title: name, muted: true }).addTo(map)`
 *
 * @param latLng Where to draw it.
 * @param style The layer's style (color and radius).
 * @param options The marker's title, whether it's muted, and its fill colors.
 * @return A Leaflet marker, not yet added to a map.
 */
export function createMarker(
  latLng: L.LatLngExpression,
  style: LayerStyle,
  options: MarkerOptions,
): L.Marker {
  const size = 2 * (style.radius + OUTLINE_WIDTH);
  const colors = options.colors?.length ? options.colors : [style.color];
  return L.marker(latLng, {
    icon: L.divIcon({
      className: options.muted ? 'map-marker map-marker--muted' : 'map-marker',
      html: markerSvg(colors, style.radius, size, options.muted ?? false),
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
 * Draws the marker's SVG: one circle for one color, or pie slices plus an outline ring.
 * Only colors and sizes (developer-controlled constants) go into the markup.
 *
 * @param colors Fill colors, at least one.
 * @param radius Circle radius in pixels.
 * @param size The SVG's width and height in pixels.
 * @param muted Whether to grey it out.
 * @return SVG markup.
 */
function markerSvg(
  colors: readonly string[],
  radius: number,
  size: number,
  muted: boolean,
): string {
  const center = size / 2;
  const outline = muted ? MUTED_OUTLINE_COLOR : OUTLINE_COLOR;
  const opacity = muted ? MUTED_OPACITY : 1;
  const ring =
    `<circle cx="${center}" cy="${center}" r="${radius}" ` +
    `stroke="${outline}" stroke-width="${OUTLINE_WIDTH}"`;
  const body =
    colors.length === 1
      ? `${ring} fill="${colors[0]}"/>`
      : colors.map((color, i) => slicePath(color, i, colors.length, center, radius)).join('') +
        `${ring} fill="none"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" aria-hidden="true" opacity="${opacity}">${body}</svg>`
  );
}

/**
 * Draws one equal pie slice, starting at 12 o'clock and going clockwise.
 *
 * @param color The slice's fill.
 * @param index Which slice (0-based).
 * @param count How many slices there are (2 or more).
 * @param center The circle's center, in pixels from the SVG's corner.
 * @param radius The circle's radius.
 * @return An SVG `<path>`.
 */
function slicePath(
  color: string,
  index: number,
  count: number,
  center: number,
  radius: number,
): string {
  const start = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const end = start + (2 * Math.PI) / count;
  const point = (angle: number) =>
    `${round(center + radius * Math.cos(angle))} ${round(center + radius * Math.sin(angle))}`;
  return (
    `<path d="M ${center} ${center} L ${point(start)} A ${radius} ${radius} 0 0 1 ` +
    `${point(end)} Z" fill="${color}" stroke="${OUTLINE_COLOR}" ` +
    `stroke-width="${SLICE_GAP_WIDTH}"/>`
  );
}

/**
 * Rounds a coordinate to 2 decimal places, to keep the markup short.
 *
 * @param value A coordinate in pixels.
 * @return The rounded value.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
