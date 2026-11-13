/**
 * @fileoverview Unit tests for `StatusBadge`.
 *
 * Checks that it shows the backend's health status, and marks the backend as down
 * when the health check fails.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { MapApi } from '../core/map-api';
import { Health } from '../core/models';
import { StatusBadge } from './status-badge';

/**
 * Renders the badge with a fake health check.
 *
 * @param health What `MapApi.health()` returns.
 * @return The badge's status element.
 */
async function render(health: Observable<Health>): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [StatusBadge],
    providers: [{ provide: MapApi, useValue: { health: () => health } }],
  });
  const fixture = TestBed.createComponent(StatusBadge);
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('.status')!;
}

describe('StatusBadge', () => {
  it('shows the backend status', async () => {
    const badge = await render(of({ status: 'ok' }));
    expect(badge.textContent!.trim()).toBe('backend: ok');
    expect(badge.classList).not.toContain('down');
    expect(badge.getAttribute('role')).toBe('status');
  });

  it('shows unreachable when the health check fails', async () => {
    const badge = await render(throwError(() => new Error('down')));
    expect(badge.textContent!.trim()).toBe('backend: unreachable');
    expect(badge.classList).toContain('down');
  });
});
