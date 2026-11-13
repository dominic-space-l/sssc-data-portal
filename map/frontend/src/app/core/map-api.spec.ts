/**
 * @fileoverview Unit tests for `MapApi`, `filterParams`, and `describeApiError`.
 *
 * Checks each route's URL and parameters against `HttpTestingController`, that filter
 * values become the query parameters the backend parses, and that failures reduce to
 * the API's code and message.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MapApi, describeApiError, filterParams } from './map-api';
import { Detail, FeatureCollection, LayerManifest } from './models';

const MANIFEST: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  location_note: 'Approximate location',
  muted_label: 'Inactive',
  popup_fields: [{ key: 'name', label: 'Station' }],
  filters: [],
};

const COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: { type: 'Point', coordinates: [-135.3341, 57.0511] },
      properties: { name: 'Test Station 1', code: 'TS1', active: 'Yes', muted: false },
    },
  ],
};

describe('MapApi', () => {
  let api: MapApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(MapApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gets health', () => {
    let status = '';
    api.health().subscribe((res) => (status = res.status));
    const req = http.expectOne('/api/health');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok' });
    expect(status).toBe('ok');
  });

  it('unwraps the manifest layers', () => {
    let layers: readonly LayerManifest[] = [];
    api.layers().subscribe((res) => (layers = res));
    http.expectOne('/api/layers').flush({ layers: [MANIFEST] });
    expect(layers).toEqual([MANIFEST]);
  });

  it('gets features with no filters', () => {
    let collection: FeatureCollection | undefined;
    api.features('stations').subscribe((res) => (collection = res));
    const req = http.expectOne((r) => r.url === '/api/layers/stations/features');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(COLLECTION);
    expect(collection).toEqual(COLLECTION);
  });

  it('sends filters as query parameters', () => {
    api
      .features('stations', { project: 4, station_type: [1, 2], active: true, organization: null })
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/layers/stations/features');
    expect(req.request.urlWithParams).toBe(
      '/api/layers/stations/features?project=4&station_type=1,2&active=true',
    );
    req.flush(COLLECTION);
  });

  it('encodes the layer id in the path', () => {
    api.features('a/b').subscribe();
    http.expectOne('/api/layers/a%2Fb/features').flush(COLLECTION);
  });

  it('gets one feature detail', () => {
    const detail: Detail = {
      id: 3,
      title: 'Test Station 3',
      sections: [{ title: 'Overview', fields: [{ label: 'Code', value: 'TS3' }] }],
      links: [],
      data: {},
    };
    let received: Detail | undefined;
    api.detail('stations', 3).subscribe((res) => (received = res));
    http.expectOne('/api/layers/stations/features/3').flush(detail);
    expect(received).toEqual(detail);
  });

  it('passes errors through to the subscriber', () => {
    let error: unknown;
    api.features('stations').subscribe({ error: (err) => (error = err) });
    http
      .expectOne((r) => r.url === '/api/layers/stations/features')
      .flush(
        {
          error: {
            code: 'masking_unavailable',
            message: 'Station locations are temporarily unavailable.',
          },
        },
        { status: 503, statusText: 'Service Unavailable' },
      );
    expect(describeApiError(error)).toEqual({
      status: 503,
      code: 'masking_unavailable',
      message: 'Station locations are temporarily unavailable.',
    });
  });
});

describe('filterParams', () => {
  it('leaves out null, undefined, and empty lists', () => {
    const params = filterParams({ project: null, station_type: [], other: undefined as never });
    expect(params.keys()).toEqual([]);
  });

  it('keeps zero and false, which are real values', () => {
    const params = filterParams({ project: 0, active: false });
    expect(params.toString()).toBe('project=0&active=false');
  });

  it('joins a single-item list without a trailing comma', () => {
    expect(filterParams({ station_type: [3] }).toString()).toBe('station_type=3');
  });
});

describe('describeApiError', () => {
  it('reports an unreachable server as a network error', () => {
    const err = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
    expect(describeApiError(err)).toEqual({
      status: 0,
      code: 'network_error',
      message: 'The map server could not be reached.',
    });
  });

  it('falls back to the status when the body is not the API shape', () => {
    const err = new HttpErrorResponse({ status: 504, error: '<html>Gateway Timeout</html>' });
    expect(describeApiError(err)).toEqual({
      status: 504,
      code: 'http_error',
      message: 'The map server returned an error (504).',
    });
  });

  it('handles errors that are not HTTP errors', () => {
    expect(describeApiError(new Error('boom')).code).toBe('unknown_error');
  });
});
