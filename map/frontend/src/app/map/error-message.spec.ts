/**
 * @fileoverview Unit tests for the error-state messages.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { LayerManifest } from '../core/models';
import { layerErrorMessage, manifestErrorMessage } from './error-message';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  popup_fields: [],
  filters: [],
};

describe('error messages', () => {
  it('names the layer, then gives the backend explanation', () => {
    const error = {
      status: 503,
      code: 'masking_unavailable',
      message: 'Station locations are temporarily unavailable.',
    };
    expect(layerErrorMessage(LAYER, error)).toBe(
      "Stations couldn't be loaded. Station locations are temporarily unavailable.",
    );
  });

  it('explains a manifest failure', () => {
    const error = {
      status: 0,
      code: 'network_error',
      message: 'The map server could not be reached.',
    };
    expect(manifestErrorMessage(error)).toBe(
      "The map couldn't load its layers. The map server could not be reached.",
    );
  });
});
