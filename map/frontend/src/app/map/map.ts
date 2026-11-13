/**
 * @fileoverview Full-page Leaflet map that draws every visible layer from the manifest.
 *
 * Loads the manifest through `MapState`, then fetches and draws each `default_visible`
 * layer's features with `MapApi`. Markers come from `layers/markers.ts`, styled by
 * `layers/registry.ts`, and open a popup built from the layer's `popup_fields` and
 * `location_note`. Features with `muted: true` are greyed out. Nothing here knows which
 * layers exist. Each layer is redrawn whenever its filter values in `MapState` change
 * (set by `FilterPanel`), and an empty result shows a message over the map.
 * Zoom is capped at `MAX_ZOOM`, because the points are approximate.
 *
 * Usage: routed at `''` in `app.routes.ts`; rendered as `<map-map>`.
 */

import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { MapApi, describeApiError } from '../core/map-api';
import { MapState } from '../core/map-state';
import { FeatureCollection, LayerManifest } from '../core/models';
import { createMarker } from '../layers/markers';
import { buildPopup } from '../layers/popup';
import { styleFor } from '../layers/registry';
import { FilterPanel } from '../filter-panel/filter-panel';
import { StatusBadge } from '../status-badge/status-badge';
import { emptyMessage } from './empty-message';

/** Where the map starts, before any layer loads: Sitka, AK. */
export const INITIAL_CENTER: L.LatLngExpression = [57.04907, -135.33905];
export const INITIAL_ZOOM = 10;
/**
 * Closest zoom allowed. Points are masked 250-500 m from the truth, so zooming further
 * would imply a precision they don't have.
 */
export const MAX_ZOOM = 14;
/** Closest zoom when fitting the map to the first layer's features. */
const FIT_MAX_ZOOM = 12;

/** Map page: owns the Leaflet map and one feature group per drawn layer. */
@Component({
  selector: 'map-map',
  imports: [FilterPanel, StatusBadge],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapView {
  private readonly api = inject(MapApi);
  private readonly state = inject(MapState);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');

  /** The Leaflet map, once it has been created after the first render. */
  private readonly map = signal<L.Map | null>(null);
  /** The drawn feature group for each layer id. */
  private readonly drawn = new Map<string, L.FeatureGroup>();
  /** Whether the view has been fitted to features yet. */
  private fitted = false;

  /** One message for each visible layer that loaded with no features. */
  protected readonly emptyMessages = computed(() =>
    this.state
      .visibleLayers()
      .filter((layer) => {
        const load = this.state.layerLoads()[layer.id];
        return load?.status === 'ready' && load.count === 0;
      })
      .map((layer) => emptyMessage(layer, this.state.filtersFor(layer.id))),
  );

  /**
   * Creates the Leaflet map after first render, loads the manifest, and keeps each
   * visible layer drawn with its current filters.
   *
   * Usage: instantiated by Angular; not called directly. The map is removed when the
   * component is destroyed.
   */
  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const map = L.map(this.container().nativeElement, { maxZoom: MAX_ZOOM }).setView(
        INITIAL_CENTER,
        INITIAL_ZOOM,
      );
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: MAX_ZOOM,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      this.map.set(map);
      destroyRef.onDestroy(() => map.remove());
    });

    this.state.loadManifest();

    // Reruns when the map is created, the manifest loads, or a layer's filters change.
    effect((onCleanup) => {
      const map = this.map();
      if (!map) {
        return;
      }
      const subscriptions = this.state.visibleLayers().map((layer) => this.loadLayer(map, layer));
      onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
    });
  }

  /**
   * Fetches one layer's features with its current filters and draws them.
   *
   * @param map The Leaflet map.
   * @param layer The layer's manifest entry.
   * @return The request's subscription, so a newer request can cancel it.
   */
  private loadLayer(map: L.Map, layer: LayerManifest): Subscription {
    const filters = this.state.filtersFor(layer.id);
    return untracked(() => {
      this.state.setLayerLoad(layer.id, { status: 'loading' });
      return this.api.features(layer.id, filters).subscribe({
        next: (collection) => {
          this.draw(map, layer, collection);
          this.state.setLayerLoad(layer.id, {
            status: 'ready',
            count: collection.features.length,
          });
        },
        error: (err: unknown) => {
          this.state.setLayerLoad(layer.id, { status: 'error', error: describeApiError(err) });
        },
      });
    });
  }

  /**
   * Replaces a layer's markers with the given features.
   *
   * @param map The Leaflet map.
   * @param layer The layer's manifest entry.
   * @param collection Its features.
   */
  private draw(map: L.Map, layer: LayerManifest, collection: FeatureCollection): void {
    this.drawn.get(layer.id)?.remove();
    const style = styleFor(layer.id);
    const group = L.featureGroup();
    for (const feature of collection.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const title = String(feature.properties[layer.popup_fields[0]?.key] ?? layer.title);
      createMarker([lat, lon], style, { title, muted: feature.properties.muted === true })
        .bindPopup(() => buildPopup(feature, layer))
        .addTo(group);
    }
    group.addTo(map);
    this.drawn.set(layer.id, group);
    this.fitOnce(map, group);
  }

  /**
   * Fits the view to the first features drawn, so the map opens on them. Later redraws
   * (filter changes) keep the user's view.
   *
   * @param map The Leaflet map.
   * @param group The features just drawn.
   */
  private fitOnce(map: L.Map, group: L.FeatureGroup): void {
    const size = map.getSize();
    if (this.fitted || group.getLayers().length === 0 || size.x === 0 || size.y === 0) {
      return;
    }
    map.fitBounds(group.getBounds(), { padding: [32, 32], maxZoom: FIT_MAX_ZOOM });
    this.fitted = true;
  }
}
