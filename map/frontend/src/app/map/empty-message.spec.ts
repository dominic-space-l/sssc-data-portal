/**
 * @fileoverview Unit tests for `emptyMessage`.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { LayerManifest } from '../core/models';
import { emptyMessage } from './empty-message';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  popup_fields: [],
  filters: [
    {
      key: 'project',
      label: 'Project',
      type: 'select',
      options: [
        { value: 1, label: 'Project Alpha' },
        { value: 3, label: 'Project Empty', hint: 'No stations' },
      ],
    },
    { key: 'station_type', label: 'Station type', type: 'multiselect', options: [] },
  ],
};

describe('emptyMessage', () => {
  it('names the layer and blames the filters when one is set', () => {
    expect(emptyMessage(LAYER, { station_type: [2] })).toBe('No stations match these filters.');
    expect(emptyMessage(LAYER, { project: 1 })).toBe('No stations match these filters.');
  });

  it('says there is nothing to show when no filter is set', () => {
    expect(emptyMessage(LAYER, {})).toBe('No stations to show.');
    expect(emptyMessage(LAYER, { project: null })).toBe('No stations to show.');
  });

  it('names a selected option that has a hint', () => {
    expect(emptyMessage(LAYER, { project: 3 })).toBe(
      'No stations are associated with Project Empty.',
    );
    expect(emptyMessage(LAYER, { project: 3, station_type: [1] })).toBe(
      'No stations are associated with Project Empty.',
    );
  });
});
