/**
 * @fileoverview Unit tests for `MapView`, with a fake `MapApi`.
 *
 * Renders the real component and Leaflet map (in jsdom) and checks that it loads the
 * manifest, draws one marker per feature of each default-visible layer only, greys out
 * muted features, opens a popup with the fields and note on click, caps the zoom,
 * records a failed layer load in `MapState`, and fits the view to the first features
 * drawn only.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { Observable, of, throwError } from 'rxjs';
import { MapApi } from '../core/map-api';
import { MapState } from '../core/map-state';
import { FeatureCollection, FilterValues, LayerManifest } from '../core/models';
import { FALLBACK_COLOR, OKABE_ITO } from '../layers/registry';
import { FIT_MAX_ZOOM, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM, MapView } from './map';

const STATIONS: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  location_note: 'Approximate location',
  muted_label: 'Inactive',
  popup_fields: [
    { key: 'name', label: 'Station' },
    { key: 'code', label: 'Code' },
    { key: 'active', label: 'Active' },
  ],
  filters: [],
};

const HIDDEN: LayerManifest = { ...STATIONS, id: 'hidden', default_visible: false };

const FEATURES: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: { type: 'Point', coordinates: [-135.3341, 57.0511] },
      properties: { name: 'Test Station 1', code: 'TS1', active: 'Yes', muted: false },
    },
    {
      type: 'Feature',
      id: 3,
      geometry: { type: 'Point', coordinates: [-135.2871, 57.0677] },
      properties: { name: 'Test Station 3', code: 'TS3', active: 'No', muted: true },
    },
  ],
};

/** A MapApi stand-in that records which layers' features were requested, with filters. */
class FakeMapApi {
  readonly requested: string[] = [];
  readonly filtersRequested: FilterValues[] = [];
  /** Set to change what later `features()` calls return. */
  next$: Observable<FeatureCollection> | null = null;
  /** Set to change what `layers()` returns. */
  layers$: Observable<readonly LayerManifest[]> | null = null;

  /**
   * @param manifest The layers `layers()` returns.
   * @param features What `features()` returns.
   */
  constructor(
    private readonly manifest: readonly LayerManifest[],
    private readonly features$: Observable<FeatureCollection>,
  ) {}

  /** @return A healthy backend. */
  health() {
    return of({ status: 'ok' });
  }

  /** @return The manifest (`layers$` if set). */
  layers() {
    return this.layers$ ?? of(this.manifest);
  }

  /**
   * Records the request.
   *
   * @param layerId The layer requested.
   * @param filters Its filters.
   * @return The canned features (`next$` if set).
   */
  features(layerId: string, filters: FilterValues = {}) {
    this.requested.push(layerId);
    this.filtersRequested.push(filters);
    return this.next$ ?? this.features$;
  }
}

/**
 * Renders MapView with a fake API and waits for the map and markers.
 *
 * @param api The fake API.
 * @return The fixture.
 */
async function render(api: FakeMapApi): Promise<ComponentFixture<MapView>> {
  TestBed.configureTestingModule({
    imports: [MapView],
    providers: [{ provide: MapApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(MapView);
  await fixture.whenStable();
  return fixture;
}

/**
 * Finds the drawn marker icons.
 *
 * @param fixture The rendered MapView.
 * @return The marker elements.
 */
function markers(fixture: ComponentFixture<MapView>): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.map-marker')];
}

describe('MapView', () => {
  it('draws one marker per feature of each visible layer', async () => {
    const api = new FakeMapApi([STATIONS, HIDDEN], of(FEATURES));
    const fixture = await render(api);

    expect(api.requested).toEqual(['stations']);
    expect(markers(fixture).length).toBe(2);
    expect(markers(fixture).map((m) => m.title)).toEqual(['Test Station 1', 'Test Station 3']);
    expect(TestBed.inject(MapState).layerLoads()['stations']).toEqual({
      status: 'ready',
      count: 2,
      mutedCount: 1,
    });
  });

  it('greys out muted features only', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    const muted = markers(fixture).map((m) => m.classList.contains('map-marker--muted'));
    expect(muted).toEqual([false, true]);
  });

  it('opens a popup with the fields and location note on click', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    markers(fixture)[1].click();

    const popup = (fixture.nativeElement as HTMLElement).querySelector('.map-popup')!;
    expect(popup).not.toBeNull();
    expect([...popup.querySelectorAll('dd')].map((el) => el.textContent)).toEqual([
      'Test Station 3',
      'TS3',
      'No',
    ]);
    expect(popup.textContent).toContain('Approximate location');
  });

  it('caps the zoom, since points are approximate', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    const map = (fixture.componentInstance as unknown as { map: () => L.Map }).map();
    expect(map.getMaxZoom()).toBe(MAX_ZOOM);
  });

  it('records a failed layer load and draws nothing', async () => {
    const failure = new HttpErrorResponse({
      status: 503,
      error: { error: { code: 'masking_unavailable', message: 'Unavailable.' } },
    });
    const fixture = await render(
      new FakeMapApi(
        [STATIONS],
        throwError(() => failure),
      ),
    );

    expect(markers(fixture)).toEqual([]);
    expect(TestBed.inject(MapState).layerLoads()['stations']).toEqual({
      status: 'error',
      error: { status: 503, code: 'masking_unavailable', message: 'Unavailable.' },
    });
  });

  it('redraws a layer with its new filters when they change', async () => {
    const api = new FakeMapApi([STATIONS], of(FEATURES));
    const fixture = await render(api);
    api.next$ = of({ type: 'FeatureCollection', features: [FEATURES.features[1]] });

    TestBed.inject(MapState).setFilter('stations', 'station_type', [1]);
    await fixture.whenStable();

    expect(api.filtersRequested).toEqual([{}, { station_type: [1] }]);
    expect(markers(fixture).map((m) => m.title)).toEqual(['Test Station 3']);
  });

  it('shows the empty state when a layer comes back with no features', async () => {
    const api = new FakeMapApi([STATIONS], of(FEATURES));
    const fixture = await render(api);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.empty')).toBeNull();

    api.next$ = of({ type: 'FeatureCollection', features: [] });
    TestBed.inject(MapState).setFilter('stations', 'station_type', [9]);
    await fixture.whenStable();

    expect(markers(fixture)).toEqual([]);
    expect(element.querySelector('.empty')!.textContent).toBe('No stations match these filters.');
  });

  it('colors markers by role while an organization is chosen, naming the roles', async () => {
    const withRoles: LayerManifest = {
      ...STATIONS,
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
    const api = new FakeMapApi([withRoles], of(FEATURES));
    const fixture = await render(api);
    // Uncolored until an organization is chosen.
    expect(markers(fixture)[0].querySelectorAll('path').length).toBe(0);

    api.next$ = of({
      type: 'FeatureCollection',
      features: [
        {
          ...FEATURES.features[0],
          properties: { ...FEATURES.features[0].properties, roles: [1, 3] },
        },
        { ...FEATURES.features[1], properties: { ...FEATURES.features[1].properties, roles: [] } },
      ],
    });
    TestBed.inject(MapState).setFilter('stations', 'organization', 1);
    await fixture.whenStable();

    const [pie, none] = markers(fixture);
    expect([...pie.querySelectorAll('path')].map((p) => p.getAttribute('fill'))).toEqual([
      OKABE_ITO[0],
      OKABE_ITO[2],
    ]);
    expect(none.querySelector('circle')!.getAttribute('fill')).toBe(FALLBACK_COLOR);
    expect(markers(fixture).map((m) => m.title)).toEqual([
      'Test Station 1 (Owner, Maintainer)',
      'Test Station 3 (No role with this organization)',
    ]);
  });

  it('shows the legend for muted markers', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    const legend = (fixture.nativeElement as HTMLElement).querySelector('map-legend');
    expect(legend!.textContent).toContain('Inactive');
  });

  it('shows the filter panel', async () => {
    const withFilter: LayerManifest = {
      ...STATIONS,
      filters: [{ key: 'station_type', label: 'Station type', type: 'multiselect', options: [] }],
    };
    const fixture = await render(new FakeMapApi([withFilter], of(FEATURES)));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('map-filter-panel details'),
    ).not.toBeNull();
  });

  it('shows a layer error with Retry, which loads the layer again', async () => {
    const failure = new HttpErrorResponse({
      status: 503,
      error: {
        error: {
          code: 'masking_unavailable',
          message: 'Station locations are temporarily unavailable.',
        },
      },
    });
    const api = new FakeMapApi(
      [STATIONS],
      throwError(() => failure),
    );
    const fixture = await render(api);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role=alert] .error p')!.textContent).toBe(
      "Stations couldn't be loaded. Station locations are temporarily unavailable.",
    );

    api.next$ = of(FEATURES);
    element.querySelector<HTMLButtonElement>('.error button')!.click();
    await fixture.whenStable();

    expect(api.requested).toEqual(['stations', 'stations']);
    expect(element.querySelector('.error')).toBeNull();
    expect(markers(fixture).length).toBe(2);
  });

  it('removes markers from an earlier load when a reload fails', async () => {
    const api = new FakeMapApi([STATIONS], of(FEATURES));
    const fixture = await render(api);
    expect(markers(fixture).length).toBe(2);

    api.next$ = throwError(() => new HttpErrorResponse({ status: 0 }));
    TestBed.inject(MapState).setFilter('stations', 'station_type', [1]);
    await fixture.whenStable();

    expect(markers(fixture)).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.error p')!.textContent).toBe(
      "Stations couldn't be loaded. The map server could not be reached.",
    );
  });

  it('shows a manifest error with Retry, which loads the manifest again', async () => {
    const api = new FakeMapApi([STATIONS], of(FEATURES));
    api.layers$ = throwError(() => new HttpErrorResponse({ status: 0 }));
    const fixture = await render(api);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.error p')!.textContent).toBe(
      "The map couldn't load its layers. The map server could not be reached.",
    );
    expect(api.requested).toEqual([]);

    api.layers$ = null;
    element.querySelector<HTMLButtonElement>('.error button')!.click();
    await fixture.whenStable();

    expect(element.querySelector('.error')).toBeNull();
    expect(markers(fixture).length).toBe(2);
  });

  it('shows the status badge', async () => {
    const fixture = await render(new FakeMapApi([], of(FEATURES)));
    const badge = (fixture.nativeElement as HTMLElement).querySelector('map-status-badge');
    expect(badge!.textContent).toContain('backend: ok');
  });

  it('keeps the starting view while the map has no size', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    const map = leafletMap(fixture);
    expect(map.getCenter()).toEqual(L.latLng(INITIAL_CENTER));
    expect(map.getZoom()).toBe(INITIAL_ZOOM);
  });
});

describe('MapView fitting the view', () => {
  // jsdom lays nothing out, so every element is 0x0 and the map never fits. Give the
  // map's container a size, as a browser would.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The bounds of FEATURES, in Leaflet's lat/lng order. */
  const featureBounds = L.latLngBounds(
    FEATURES.features.map(({ geometry }) =>
      L.latLng(geometry.coordinates[1], geometry.coordinates[0]),
    ),
  );

  it('fits the first features drawn, no closer than the fit zoom', async () => {
    const fixture = await render(new FakeMapApi([STATIONS], of(FEATURES)));
    const map = leafletMap(fixture);

    expect(map.getBounds().contains(featureBounds)).toBe(true);
    expect(map.getZoom()).toBeLessThanOrEqual(FIT_MAX_ZOOM);
    expect(map.getCenter()).not.toEqual(L.latLng(INITIAL_CENTER));
  });

  it("keeps the user's view when a filter change redraws the layer", async () => {
    const api = new FakeMapApi([STATIONS], of(FEATURES));
    const fixture = await render(api);
    const map = leafletMap(fixture);
    const center = map.getCenter();
    const zoom = map.getZoom();

    api.next$ = of({
      type: 'FeatureCollection',
      features: [
        {
          ...FEATURES.features[0],
          id: 9,
          geometry: { type: 'Point', coordinates: [-134.4, 58.3] },
        },
      ],
    });
    TestBed.inject(MapState).setFilter('stations', 'station_type', [2]);
    await fixture.whenStable();

    expect(markers(fixture).length).toBe(1);
    expect(map.getCenter()).toEqual(center);
    expect(map.getZoom()).toBe(zoom);
  });

  it('waits for features before fitting, then fits the first ones drawn', async () => {
    const api = new FakeMapApi([STATIONS], of({ type: 'FeatureCollection', features: [] }));
    const fixture = await render(api);
    const map = leafletMap(fixture);
    expect(map.getCenter()).toEqual(L.latLng(INITIAL_CENTER));

    api.next$ = of(FEATURES);
    TestBed.inject(MapState).setFilter('stations', 'station_type', [1]);
    await fixture.whenStable();

    // The starting view already contains these stations, so check that the view moved.
    expect(map.getCenter()).not.toEqual(L.latLng(INITIAL_CENTER));
    expect(map.getBounds().contains(featureBounds)).toBe(true);
  });
});

/**
 * Reaches the component's Leaflet map.
 *
 * @param fixture The rendered MapView.
 * @return The map.
 */
function leafletMap(fixture: ComponentFixture<MapView>): L.Map {
  return (fixture.componentInstance as unknown as { map: () => L.Map }).map();
}
