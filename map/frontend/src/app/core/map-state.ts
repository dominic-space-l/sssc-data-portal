/**
 * @fileoverview Shared state for the map page: the manifest, filter values, and load status.
 *
 * Components talk to each other only through this service (see "Data flow on the
 * frontend" in documentation/map/map_app_plan.md). `MapView` reads the visible layers
 * and their filters and reports each layer's load status here. The filter panel (map
 * commit 13) will write filter values here.
 *
 * Usage:
 *   private readonly state = inject(MapState);
 *   this.state.loadManifest();
 *   effect(() => console.log(this.state.visibleLayers()));
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { MapApi, describeApiError } from './map-api';
import { ApiError, FilterValues, LayerManifest } from './models';

/** Where a request stands. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The load status of one layer's features. */
export interface LayerLoad {
  readonly status: LoadStatus;
  /** The failure, when `status` is `'error'`. */
  readonly error?: ApiError;
  /** How many features were drawn, when `status` is `'ready'`. */
  readonly count?: number;
}

const NO_FILTERS: FilterValues = {};

/** Holds the manifest, per-layer filter values, and loading and error state as signals. */
@Injectable({ providedIn: 'root' })
export class MapState {
  private readonly api = inject(MapApi);

  private readonly manifestSignal = signal<readonly LayerManifest[] | null>(null);
  private readonly manifestStatusSignal = signal<LoadStatus>('idle');
  private readonly manifestErrorSignal = signal<ApiError | null>(null);
  private readonly filtersSignal = signal<Readonly<Record<string, FilterValues>>>({});
  private readonly layerLoadsSignal = signal<Readonly<Record<string, LayerLoad>>>({});

  /** Every layer from the backend, or null until the manifest has loaded. */
  readonly manifest = this.manifestSignal.asReadonly();
  /** Load status of the manifest. */
  readonly manifestStatus = this.manifestStatusSignal.asReadonly();
  /** Why the manifest failed to load, if it did. */
  readonly manifestError = this.manifestErrorSignal.asReadonly();
  /** Filter values by layer id. */
  readonly filters = this.filtersSignal.asReadonly();
  /** Load status of each layer's features, by layer id. */
  readonly layerLoads = this.layerLoadsSignal.asReadonly();

  /** The layers drawn on the map: those marked `default_visible`. */
  readonly visibleLayers = computed(() =>
    (this.manifest() ?? []).filter((layer) => layer.default_visible),
  );

  /**
   * Loads the manifest from the backend. Calling it again reloads it.
   *
   * Usage: `state.loadManifest();` once, when the map page starts.
   */
  loadManifest(): void {
    this.manifestStatusSignal.set('loading');
    this.manifestErrorSignal.set(null);
    this.api.layers().subscribe({
      next: (layers) => {
        this.manifestSignal.set(layers);
        this.manifestStatusSignal.set('ready');
      },
      error: (err: unknown) => {
        this.manifestErrorSignal.set(describeApiError(err));
        this.manifestStatusSignal.set('error');
      },
    });
  }

  /**
   * Returns one layer's filter values. Reading it inside an `effect` or `computed`
   * tracks them, so the reader reruns when they change.
   *
   * Usage: `state.filtersFor('stations')`
   *
   * @param layerId The layer's id.
   * @return Its filter values, or an empty object if none are set.
   */
  filtersFor(layerId: string): FilterValues {
    return this.filters()[layerId] ?? NO_FILTERS;
  }

  /**
   * Records how loading a layer's features went.
   *
   * Usage: `state.setLayerLoad('stations', { status: 'ready', count: 12 });`
   *
   * @param layerId The layer's id.
   * @param load Its new load status.
   */
  setLayerLoad(layerId: string, load: LayerLoad): void {
    this.layerLoadsSignal.update((loads) => ({ ...loads, [layerId]: load }));
  }
}
