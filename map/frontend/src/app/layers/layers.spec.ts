/**
 * @fileoverview Unit tests for the layer presentation helpers: styles, markers, popups.
 *
 * Checks that a layer's style falls back to the default, that markers draw the style's
 * color and grey out when muted, and that popups list the manifest's fields as text
 * (never as markup) followed by the location note.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import * as L from 'leaflet';
import { Feature, LayerManifest } from '../core/models';
import { MUTED_OPACITY, MUTED_OUTLINE_COLOR, OUTLINE_COLOR, createMarker } from './markers';
import { buildPopup } from './popup';
import { DEFAULT_STYLE, styleFor } from './registry';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  location_note: 'Approximate location',
  popup_fields: [
    { key: 'name', label: 'Station' },
    { key: 'code', label: 'Code' },
    { key: 'active', label: 'Active' },
  ],
  filters: [],
};

/**
 * Builds a station feature.
 *
 * @param properties Its properties.
 * @return The feature.
 */
function feature(properties: Feature['properties']): Feature {
  return {
    type: 'Feature',
    id: 1,
    geometry: { type: 'Point', coordinates: [-135.3341, 57.0511] },
    properties,
  };
}

/**
 * Renders a marker's icon element, as Leaflet would add it to the map.
 *
 * @param marker The marker.
 * @return The icon's root element.
 */
function iconElement(marker: L.Marker): HTMLElement {
  return marker.options.icon!.createIcon() as HTMLElement;
}

describe('styleFor', () => {
  it('gives an unknown layer the default style', () => {
    expect(styleFor('something-new')).toEqual(DEFAULT_STYLE);
  });

  it('applies a layer override on top of the default', () => {
    const style = styleFor('stations');
    expect(style.color).not.toBe(DEFAULT_STYLE.color);
    expect(style.radius).toBe(DEFAULT_STYLE.radius);
  });
});

describe('createMarker', () => {
  const style = { color: '#123456', radius: 7 };

  it('draws a circle in the layer color with a white outline', () => {
    const marker = createMarker([57.05, -135.33], style, { title: 'Test Station 1' });
    const circle = iconElement(marker).querySelector('circle')!;
    expect(circle.getAttribute('fill')).toBe('#123456');
    expect(circle.getAttribute('stroke')).toBe(OUTLINE_COLOR);
    expect(iconElement(marker).classList).not.toContain('map-marker--muted');
  });

  it('greys out a muted marker but keeps its color', () => {
    const marker = createMarker([57.05, -135.33], style, { title: 'Inactive', muted: true });
    const icon = iconElement(marker);
    const svg = icon.querySelector('svg')!;
    expect(icon.classList).toContain('map-marker--muted');
    expect(svg.getAttribute('opacity')).toBe(String(MUTED_OPACITY));
    expect(svg.querySelector('circle')!.getAttribute('stroke')).toBe(MUTED_OUTLINE_COLOR);
    expect(svg.querySelector('circle')!.getAttribute('fill')).toBe('#123456');
  });

  it('is keyboard-accessible and named by its title', () => {
    const marker = createMarker([57.05, -135.33], style, { title: 'Test Station 1' });
    expect(marker.options.keyboard).toBe(true);
    expect(marker.options.title).toBe('Test Station 1');
    expect(marker.getLatLng()).toEqual(L.latLng(57.05, -135.33));
  });

  it('never puts the title into the icon markup', () => {
    const title = '<img src=x onerror="alert(1)">';
    const marker = createMarker([57.05, -135.33], style, { title });
    expect(iconElement(marker).querySelector('img')).toBeNull();
    expect(iconElement(marker).innerHTML).not.toContain('onerror');
  });
});

describe('buildPopup', () => {
  it('lists the popup fields in order, then the location note', () => {
    const popup = buildPopup(
      feature({ name: 'Test Station 3', code: 'TS3', active: 'No', muted: true }),
      LAYER,
    );
    const labels = [...popup.querySelectorAll('dt')].map((el) => el.textContent);
    const values = [...popup.querySelectorAll('dd')].map((el) => el.textContent);
    expect(labels).toEqual(['Station', 'Code', 'Active']);
    expect(values).toEqual(['Test Station 3', 'TS3', 'No']);
    expect(popup.querySelector('.map-popup__note')!.textContent).toBe('Approximate location');
  });

  it('shows a dash for a missing value', () => {
    const popup = buildPopup(feature({ name: 'Test Station 4', active: 'Yes' }), LAYER);
    expect([...popup.querySelectorAll('dd')][1].textContent).toBe('—');
  });

  it('renders values as text, never as markup', () => {
    const name = '<img src=x onerror="alert(1)">Harbor';
    const popup = buildPopup(feature({ name, code: 'X', active: 'Yes' }), LAYER);
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('dd')!.textContent).toBe(name);
  });

  it('leaves out the note when the layer has none', () => {
    const popup = buildPopup(feature({ name: 'A' }), { ...LAYER, location_note: undefined });
    expect(popup.querySelector('.map-popup__note')).toBeNull();
  });
});
