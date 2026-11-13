/**
 * @fileoverview Unit tests for `MapState`.
 *
 * Checks manifest loading (success and failure), the visible-layer list, per-layer
 * filters defaulting to none, and recording each layer's load status.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MapApi } from './map-api';
import { MapState } from './map-state';
import { LayerManifest } from './models';

/**
 * Builds a manifest entry.
 *
 * @param id The layer id.
 * @param visible Whether it's drawn by default.
 * @return The entry.
 */
function layer(id: string, visible: boolean): LayerManifest {
  return { id, title: id, default_visible: visible, popup_fields: [], filters: [] };
}

/**
 * Creates a MapState whose MapApi.layers() returns the given observable.
 *
 * @param layers What `layers()` returns.
 * @return The state.
 */
function stateWith(layers: Observable<readonly LayerManifest[]>): MapState {
  TestBed.configureTestingModule({
    providers: [{ provide: MapApi, useValue: { layers: () => layers } }],
  });
  return TestBed.inject(MapState);
}

describe('MapState', () => {
  it('starts idle with no manifest', () => {
    const state = stateWith(of([]));
    expect(state.manifest()).toBeNull();
    expect(state.manifestStatus()).toBe('idle');
    expect(state.visibleLayers()).toEqual([]);
  });

  it('is loading until the manifest arrives, then ready', () => {
    const response = new Subject<readonly LayerManifest[]>();
    const state = stateWith(response);
    state.loadManifest();
    expect(state.manifestStatus()).toBe('loading');

    response.next([layer('stations', true), layer('sites', false)]);
    expect(state.manifestStatus()).toBe('ready');
    expect(state.manifest()!.map((l) => l.id)).toEqual(['stations', 'sites']);
  });

  it('lists only default-visible layers as visible', () => {
    const state = stateWith(of([layer('stations', true), layer('sites', false)]));
    state.loadManifest();
    expect(state.visibleLayers().map((l) => l.id)).toEqual(['stations']);
  });

  it('records why the manifest failed to load', () => {
    const failure = new HttpErrorResponse({
      status: 503,
      error: { error: { code: 'database_not_configured', message: 'Not configured.' } },
    });
    const state = stateWith(throwError(() => failure));
    state.loadManifest();
    expect(state.manifestStatus()).toBe('error');
    expect(state.manifestError()).toEqual({
      status: 503,
      code: 'database_not_configured',
      message: 'Not configured.',
    });
    expect(state.manifest()).toBeNull();
  });

  it('has no filters for a layer until some are set', () => {
    const state = stateWith(of([]));
    expect(state.filtersFor('stations')).toEqual({});
  });

  it('sets filters per layer and key', () => {
    const state = stateWith(of([]));
    state.setFilter('stations', 'project', 4);
    state.setFilter('stations', 'station_type', [1, 2]);
    state.setFilter('sites', 'project', 7);
    expect(state.filtersFor('stations')).toEqual({ project: 4, station_type: [1, 2] });
    expect(state.filtersFor('sites')).toEqual({ project: 7 });
  });

  it('stores an empty list as null, meaning no filter', () => {
    const state = stateWith(of([]));
    state.setFilter('stations', 'station_type', []);
    expect(state.filtersFor('stations')).toEqual({ station_type: null });
  });

  it('clears one layer without touching another', () => {
    const state = stateWith(of([]));
    state.setFilter('stations', 'project', 4);
    state.setFilter('sites', 'project', 7);
    state.clearFilters('stations');
    expect(state.filtersFor('stations')).toEqual({});
    expect(state.filtersFor('sites')).toEqual({ project: 7 });
  });

  it('records each layer load separately', () => {
    const state = stateWith(of([]));
    state.setLayerLoad('stations', { status: 'loading' });
    state.setLayerLoad('sites', { status: 'ready', count: 2 });
    state.setLayerLoad('stations', { status: 'ready', count: 4 });
    expect(state.layerLoads()).toEqual({
      stations: { status: 'ready', count: 4 },
      sites: { status: 'ready', count: 2 },
    });
  });
});
