/**
 * @fileoverview Shared state for the map page: the manifest, filter values, and load status.
 *
 * Components talk to each other only through this service (see "Data flow on the
 * frontend" in documentation/map/map_app_plan.md). `MapView` reads the visible layers
 * and their filters and reports each layer's load status here. The filter panel writes
 * filter values here.
 *
 * Usage:
 *   private readonly state = inject(MapState);
 *   this.state.loadManifest();
 *   effect(() => console.log(this.state.visibleLayers()));
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { MapApi, describeApiError } from './map-api';
import { ApiError, FilterOption, FilterValue, FilterValues, LayerManifest } from './models';

/** Where a request stands. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The load status of one layer's features. */
export interface LayerLoad {
  readonly status: LoadStatus;
  /** The failure, when `status` is `'error'`. */
  readonly error?: ApiError;
  /** How many features were drawn, when `status` is `'ready'`. */
  readonly count?: number;
  /** How many of them are muted (drawn greyed out), when `status` is `'ready'`. */
  readonly mutedCount?: number;
}

const NO_FILTERS: FilterValues = {};

/** For one layer: source filter key to the values it implied, by target filter key. */
type ImpliedRecord = Record<string, Readonly<Record<string, number>>>;

/** Holds the manifest, per-layer filter values, and loading and error state as signals. */
@Injectable({ providedIn: 'root' })
export class MapState {
  private readonly api = inject(MapApi);

  private readonly manifestSignal = signal<readonly LayerManifest[] | null>(null);
  private readonly manifestStatusSignal = signal<LoadStatus>('idle');
  private readonly manifestErrorSignal = signal<ApiError | null>(null);
  private readonly filtersSignal = signal<Readonly<Record<string, FilterValues>>>({});
  private readonly layerLoadsSignal = signal<Readonly<Record<string, LayerLoad>>>({});
  private readonly impliedSignal = signal<Readonly<Record<string, ImpliedRecord>>>({});
  private readonly reloadsSignal = signal(0);

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
  /** Bumped by `reload()`. `MapView` re-fetches the visible layers when it changes. */
  readonly reloads = this.reloadsSignal.asReadonly();

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
   * Asks `MapView` to fetch every visible layer again, keeping the filters. Used by the
   * error state's Retry button.
   *
   * Usage: `state.reload();`
   */
  reload(): void {
    this.reloadsSignal.update((count) => count + 1);
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
   * Sets one filter's value, as the user chose it, and applies the option's `implies`.
   * `MapView` redraws the layer when its filters change.
   *
   * Implied values (a project setting its organization) are recorded against the filter
   * that set them. When that filter changes or is cleared, the values it implied are
   * cleared too, unless the user has set them by hand since: setting a filter yourself
   * takes it over, even if you pick the same value. Only a select's option implies,
   * since a multiselect has no single chosen option.
   *
   * Usage: `state.setFilter('stations', 'project', 4);` (also sets its organization)
   *
   * @param layerId The layer's id.
   * @param key The filter's key.
   * @param value The new value. An empty list is stored as null (no filter).
   */
  setFilter(layerId: string, key: string, value: FilterValue): void {
    const normalized = Array.isArray(value) && value.length === 0 ? null : value;
    const next: Record<string, FilterValue> = { ...this.filtersFor(layerId), [key]: normalized };
    const implied = this.takeOver({ ...(this.impliedSignal()[layerId] ?? {}) }, key);

    // Undo what this filter's previous value implied, where it's still in place.
    for (const [target, impliedValue] of Object.entries(implied[key] ?? {})) {
      if (next[target] === impliedValue) {
        next[target] = null;
      }
    }
    delete implied[key];

    // Apply what the new value implies.
    const implies = this.optionFor(layerId, key, normalized)?.implies;
    if (implies && Object.keys(implies).length > 0) {
      Object.assign(next, implies);
      implied[key] = { ...implies };
      for (const target of Object.keys(implies)) {
        this.takeOver(implied, target, key);
      }
    }

    this.impliedSignal.update((all) => ({ ...all, [layerId]: implied }));
    this.filtersSignal.update((all) => ({ ...all, [layerId]: next }));
  }

  /**
   * Clears every filter on a layer, and what they implied.
   *
   * Usage: `state.clearFilters('stations');`
   *
   * @param layerId The layer's id.
   */
  clearFilters(layerId: string): void {
    this.impliedSignal.update((all) => ({ ...all, [layerId]: {} }));
    this.filtersSignal.update((all) => ({ ...all, [layerId]: NO_FILTERS }));
  }

  /**
   * Which values each filter has implied on a layer, by the filter that set them.
   *
   * Usage: `state.impliedBy('stations')` gives e.g. `{ project: { organization: 2 } }`.
   *
   * @param layerId The layer's id.
   * @return Source filter key to the values it set, still in effect.
   */
  impliedBy(layerId: string): Readonly<Record<string, Readonly<Record<string, number>>>> {
    return this.impliedSignal()[layerId] ?? {};
  }

  /**
   * Removes a filter from every other filter's implied set, because its value now comes
   * from somewhere else (the user, or another filter's implies).
   *
   * @param implied A layer's implied record, copied for editing. Changed in place.
   * @param target The filter key being set.
   * @param except A source to leave alone (the one setting it now).
   * @return The same record.
   */
  private takeOver(implied: ImpliedRecord, target: string, except?: string): ImpliedRecord {
    for (const [source, values] of Object.entries(implied)) {
      if (source !== except && target in values) {
        const rest = { ...values };
        delete rest[target];
        implied[source] = rest;
      }
    }
    return implied;
  }

  /**
   * Finds the chosen option of a select filter.
   *
   * @param layerId The layer's id.
   * @param key The filter's key.
   * @param value The value chosen.
   * @return The option, or undefined if the filter isn't a select or has no such option.
   */
  private optionFor(layerId: string, key: string, value: FilterValue): FilterOption | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }
    const filter = this.manifest()
      ?.find((layer) => layer.id === layerId)
      ?.filters.find((f) => f.key === key);
    return filter?.type === 'select' ? filter.options?.find((o) => o.value === value) : undefined;
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
