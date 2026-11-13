/**
 * @fileoverview Corner badge showing whether the map backend is up.
 *
 * Calls `GET /api/health` once and shows `backend: ok` or `backend: unreachable`. It's
 * a live region, so screen readers hear the result.
 *
 * Usage: `<map-status-badge />` inside a positioned container (MapView places it).
 */

import { Component, inject, signal } from '@angular/core';
import { MapApi } from '../core/map-api';

/** Small badge reporting the backend's health check. */
@Component({
  selector: 'map-status-badge',
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  private readonly api = inject(MapApi);

  /** `checking…`, the backend's status (`ok`), or `unreachable`. */
  protected readonly status = signal('checking…');

  /**
   * Starts the health check.
   *
   * Usage: instantiated by Angular; not called directly.
   */
  constructor() {
    this.api.health().subscribe({
      next: (res) => this.status.set(res.status),
      error: () => this.status.set('unreachable'),
    });
  }
}
