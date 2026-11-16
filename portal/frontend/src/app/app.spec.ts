/**
 * @fileoverview Unit tests for the root `App` component (the page shell).
 *
 * Usage: `npm test` from the repo root (Vitest via `ng test`).
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the SSSC name and the logged-out menu', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.brand-name')?.textContent).toContain('Sitka Sound Science Center');
    expect(page.textContent).toContain('Request access');
    expect(page.textContent).toContain('Admin login');
  });

  it('shows the land acknowledgment from the style guide', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('footer')?.textContent).toContain(
      'Lingít Aaní',
    );
  });
});
