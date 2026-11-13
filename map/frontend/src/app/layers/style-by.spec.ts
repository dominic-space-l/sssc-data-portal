/**
 * @fileoverview Unit tests for `style_by` coloring and the registry palette.
 *
 * Checks when coloring applies, that values take Okabe–Ito colors in order (cycling
 * past the end), and which colors a feature gets: one per value, or the fallback gray.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { Feature, LayerManifest } from '../core/models';
import { FALLBACK_COLOR, OKABE_ITO, styleByColor } from './registry';
import {
  featureColors,
  featureEntries,
  isStyleByActive,
  styleByEntries,
  styleByPalette,
} from './style-by';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  popup_fields: [],
  filters: [],
  style_by: {
    property: 'roles',
    label: 'Role',
    active_when: 'organization',
    values: [
      { value: 1, label: 'Owner' },
      { value: 2, label: 'Operator' },
      { value: 3, label: 'Maintainer' },
    ],
    fallback_label: 'No role with this organization',
  },
};

/**
 * Builds a feature with the given roles property.
 *
 * @param roles The property value, or undefined to leave it out.
 * @return The feature.
 */
function withRoles(roles: unknown): Feature {
  return {
    type: 'Feature',
    id: 1,
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: roles === undefined ? { name: 'A' } : { name: 'A', roles },
  };
}

describe('isStyleByActive', () => {
  it('is active only while the active_when filter has a value', () => {
    expect(isStyleByActive(LAYER, {})).toBe(false);
    expect(isStyleByActive(LAYER, { organization: null })).toBe(false);
    expect(isStyleByActive(LAYER, { project: 1 })).toBe(false);
    expect(isStyleByActive(LAYER, { organization: 2 })).toBe(true);
  });

  it('is never active for a layer without style_by', () => {
    expect(isStyleByActive({ ...LAYER, style_by: undefined }, { organization: 2 })).toBe(false);
  });
});

describe('styleByEntries', () => {
  it('gives values Okabe–Ito colors in order', () => {
    expect(styleByEntries(LAYER).map((e) => [e.label, e.color])).toEqual([
      ['Owner', OKABE_ITO[0]],
      ['Operator', OKABE_ITO[1]],
      ['Maintainer', OKABE_ITO[2]],
    ]);
  });

  it('cycles the palette when there are more values than colors', () => {
    expect(styleByColor('stations', OKABE_ITO.length, 'Extra')).toBe(OKABE_ITO[0]);
  });

  it('has no entries for a layer without style_by', () => {
    expect(styleByEntries({ ...LAYER, style_by: undefined })).toEqual([]);
  });
});

describe('featureColors', () => {
  const palette = styleByPalette(LAYER);

  it('gives one color per value, in the property order', () => {
    expect(featureColors(withRoles([1, 3]), LAYER, palette)).toEqual([OKABE_ITO[0], OKABE_ITO[2]]);
    expect(featureColors(withRoles([2]), LAYER, palette)).toEqual([OKABE_ITO[1]]);
  });

  it('uses the fallback gray when the feature has no values', () => {
    expect(featureColors(withRoles([]), LAYER, palette)).toEqual([FALLBACK_COLOR]);
    expect(featureColors(withRoles(undefined), LAYER, palette)).toEqual([FALLBACK_COLOR]);
    expect(featureColors(withRoles(null), LAYER, palette)).toEqual([FALLBACK_COLOR]);
  });

  it('skips values the palette does not know', () => {
    expect(featureEntries(withRoles([9, 2]), LAYER, palette).map((e) => e.label)).toEqual([
      'Operator',
    ]);
  });
});
