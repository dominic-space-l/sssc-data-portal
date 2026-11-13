/**
 * @fileoverview HTTP client for the map API (the Flask backend in map/backend).
 *
 * Wraps the four routes of the API contract and turns filter values into the query
 * parameters the backend parses. In dev, `/api` is proxied to the backend (see
 * proxy.conf.json). `describeApiError` reduces any failed request to a code and a
 * message the UI can show.
 *
 * Usage:
 *   private readonly api = inject(MapApi);
 *   this.api.features('stations', { station_type: [1, 2] }).subscribe(...);
 */

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  ApiError,
  ApiErrorBody,
  Detail,
  FeatureCollection,
  FilterValues,
  Health,
  LayerManifest,
  LayersResponse,
} from './models';

const API_ROOT = '/api';

/** Talks to the map API. Every method emits once and completes, or errors. */
@Injectable({ providedIn: 'root' })
export class MapApi {
  private readonly http = inject(HttpClient);

  /**
   * Checks whether the backend is up. It doesn't need the database.
   *
   * Usage: `api.health().subscribe((res) => console.log(res.status));`
   *
   * @return The health response.
   */
  health(): Observable<Health> {
    return this.http.get<Health>(`${API_ROOT}/health`);
  }

  /**
   * Loads the manifest: every layer with its filters, popup fields, and style.
   *
   * Usage: `api.layers().subscribe((layers) => ...);`
   *
   * @return The layers, in the order the backend lists them.
   */
  layers(): Observable<readonly LayerManifest[]> {
    return this.http
      .get<LayersResponse>(`${API_ROOT}/layers`)
      .pipe(map((response) => response.layers));
  }

  /**
   * Loads a layer's features with filters applied.
   *
   * Usage: `api.features('stations', { project: 4 }).subscribe((fc) => ...);`
   *
   * @param layerId The layer's id from the manifest.
   * @param filters Filter values by key. Null and empty values are left out.
   * @return A GeoJSON FeatureCollection with masked coordinates.
   */
  features(layerId: string, filters: FilterValues = {}): Observable<FeatureCollection> {
    return this.http.get<FeatureCollection>(
      `${API_ROOT}/layers/${encodeURIComponent(layerId)}/features`,
      { params: filterParams(filters) },
    );
  }

  /**
   * Loads one feature's detail.
   *
   * Usage: `api.detail('stations', 12).subscribe((detail) => ...);`
   *
   * @param layerId The layer's id.
   * @param featureId The feature's id.
   * @return The detail. A 404 errors.
   */
  detail(layerId: string, featureId: number): Observable<Detail> {
    return this.http.get<Detail>(
      `${API_ROOT}/layers/${encodeURIComponent(layerId)}/features/${featureId}`,
    );
  }
}

/**
 * Turns filter values into query parameters the backend's filter parser accepts.
 *
 * Usage: `filterParams({ project: 4, station_type: [1, 2] })` gives
 * `project=4&station_type=1,2`.
 *
 * @param filters Filter values by key.
 * @return The parameters: ids as numbers, lists comma-joined, booleans as `true` or
 *     `false`. Null, undefined, and empty lists mean no filter and are left out.
 */
export function filterParams(filters: FilterValues): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        params = params.set(key, value.join(','));
      }
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/**
 * Reduces a failed request to a status, a code, and a message safe to show.
 *
 * Usage: `error: (err) => this.error.set(describeApiError(err))`
 *
 * @param err What the HTTP observable errored with.
 * @return The API's own code and message when the body has them. Otherwise
 *     `network_error` (status 0, server unreachable) or `http_error`.
 */
export function describeApiError(err: unknown): ApiError {
  if (!(err instanceof HttpErrorResponse)) {
    return { status: 0, code: 'unknown_error', message: 'Something went wrong.' };
  }
  if (err.status === 0) {
    return {
      status: 0,
      code: 'network_error',
      message: 'The map server could not be reached.',
    };
  }
  const body = err.error as Partial<ApiErrorBody> | null;
  if (body?.error && typeof body.error.code === 'string') {
    return { status: err.status, code: body.error.code, message: body.error.message };
  }
  return {
    status: err.status,
    code: 'http_error',
    message: `The map server returned an error (${err.status}).`,
  };
}
