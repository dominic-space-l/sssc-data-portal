/**
 * @fileoverview Unit tests for the app's providers (`app.config.ts`) and routes (`app.routes.ts`).
 *
 * Checks that `appConfig` provides the router with the app's routes and an `HttpClient`
 * (which `MapApi` needs), that the map is the only page, and that unknown paths redirect to it.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { MapView } from './map/map';

describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
  });

  it('provides the router with the app routes', () => {
    // The router keeps its own copy of the array, so compare contents.
    expect(TestBed.inject(Router).config).toEqual(routes);
  });

  it('provides HttpClient, which MapApi needs', () => {
    expect(TestBed.inject(HttpClient)).toBeInstanceOf(HttpClient);
  });

  it('redirects unknown paths to the map', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/no/such/page');
    expect(router.url).toBe('/');
  });
});

describe('routes', () => {
  it('serves the map at the root', () => {
    expect(routes.find((route) => route.path === '')?.component).toBe(MapView);
  });
});
