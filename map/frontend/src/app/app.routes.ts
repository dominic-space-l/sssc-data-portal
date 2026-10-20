import { Routes } from '@angular/router';
import { MapView } from './map/map';

export const routes: Routes = [
  { path: '', component: MapView },
  { path: '**', redirectTo: '' },
];
