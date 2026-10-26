/**
 * @fileoverview HTTP client for the Flask map backend.
 *
 * In dev, `/api` is proxied to the backend (see proxy.conf.json).
 * Usage: `private readonly api = inject(Api);` then `this.api.health().subscribe(...)`.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Response body of `GET /api/health`. */
export interface Health {
  status: string;
}

/** Talks to the Flask map backend. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  /**
   * Checks whether the backend is reachable.
   *
   * Usage: `api.health().subscribe((res) => console.log(res.status));`
   *
   * @return An observable that emits the health response once, or errors if
   *     the backend is unreachable.
   */
  health(): Observable<Health> {
    return this.http.get<Health>('/api/health');
  }
}
