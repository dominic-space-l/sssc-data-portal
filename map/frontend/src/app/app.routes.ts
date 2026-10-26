/**
 * @fileoverview Route table for the map app.
 *
 * Usage: registered via `provideRouter(routes)` in `app.config.ts`. The map
 * is the only page; unknown paths redirect to it.
 */

import { Routes } from '@angular/router';
import { MapView } from './map/map';

export const routes: Routes = [
  { path: '', component: MapView },
  { path: '**', redirectTo: '' },
];
