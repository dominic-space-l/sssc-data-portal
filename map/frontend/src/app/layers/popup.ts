/**
 * @fileoverview Builds a marker's popup from the layer's manifest entry.
 *
 * The popup lists the layer's `popup_fields` (label and value) in order, then its
 * `location_note`. It's built from DOM nodes with `textContent`, never from HTML
 * strings, so a value from the database can't inject markup.
 *
 * Usage: `marker.bindPopup(buildPopup(feature, layer));`
 */

import { Feature, LayerManifest } from '../core/models';

/**
 * Builds the popup content for one feature.
 *
 * Usage: `buildPopup(feature, manifestEntry)`
 *
 * @param feature The feature clicked.
 * @param layer Its layer's manifest entry.
 * @return A detached element to pass to `bindPopup`.
 */
export function buildPopup(feature: Feature, layer: LayerManifest): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const list = document.createElement('dl');
  for (const field of layer.popup_fields) {
    const term = document.createElement('dt');
    term.textContent = field.label;
    const value = document.createElement('dd');
    value.textContent = displayValue(feature.properties[field.key]);
    list.append(term, value);
  }
  root.append(list);

  if (layer.location_note) {
    const note = document.createElement('p');
    note.className = 'map-popup__note';
    note.textContent = layer.location_note;
    root.append(note);
  }
  return root;
}

/**
 * Turns a property value into display text. The backend sends display-ready values,
 * so this only guards against missing ones.
 *
 * @param value A feature property.
 * @return The text, or an em dash when the value is missing.
 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}
