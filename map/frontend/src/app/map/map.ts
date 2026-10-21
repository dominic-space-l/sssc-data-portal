import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { Api } from '../services/api';

// Placeholder view: Sitka, AK
const INITIAL_CENTER: L.LatLngExpression = [57.04907, -135.33905];
const INITIAL_ZOOM = 10;

// Leaflet guesses its default marker image paths from leaflet.css, which breaks once the
// bundler renames the files, so point it at the bundled URLs directly.
L.Icon.Default.imagePath = '';
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

@Component({
  selector: 'map-map',
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapView {
  private readonly api = inject(Api);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected readonly backendStatus = signal('checking…');

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const map = L.map(this.container().nativeElement).setView(INITIAL_CENTER, INITIAL_ZOOM);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.marker(INITIAL_CENTER).addTo(map).bindPopup('Western Washington University');

      destroyRef.onDestroy(() => map.remove());
    });

    this.api.health().subscribe({
      next: (res) => this.backendStatus.set(res.status),
      error: () => this.backendStatus.set('unreachable'),
    });
  }
}
