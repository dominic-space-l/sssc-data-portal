/**
 * @fileoverview Unit tests for `MapView`, with a fake `MapApi`.
 *
 * Renders the real component and Leaflet map (in jsdom) and checks that it loads the
 * manifest, draws one marker per feature of each default-visible layer only, greys out
 * muted features, opens a popup with the fields and note on click, caps the zoom, and
 * records a failed layer load in `MapState`.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type * as L from 'leaflet';
import { Observable, of, throwError } from 'rxjs';
import { MapApi } from '../core/map-api';
import { MapState } from '../core/map-state';
import { FeatureCollection, FilterValues, LayerManifest } from '../core/models';
import { FALLBACK_COLOR, OKABE_ITO } from '../layers/registry';
import { MAX_ZOOM, MapView } from './map';

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

  /** @return The manifest. */
  layers() {
    return of(this.manifest);
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

  it('shows the status badge', async () => {
    const fixture = await render(new FakeMapApi([], of(FEATURES)));
    const badge = (fixture.nativeElement as HTMLElement).querySelector('map-status-badge');
    expect(badge!.textContent).toContain('backend: ok');
  });
});
