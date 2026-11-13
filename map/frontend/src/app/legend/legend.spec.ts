/**
 * @fileoverview Unit tests for `Legend`.
 *
 * Checks that it's hidden when there's nothing to explain, lists each `style_by` value
 * with its marker color plus the fallback while the coloring is active, and adds the
 * muted label whenever a muted marker is drawn.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MapApi } from '../core/map-api';
import { MapState } from '../core/map-state';
import { LayerManifest } from '../core/models';
import { FALLBACK_COLOR, OKABE_ITO } from '../layers/registry';
import { Legend } from './legend';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  muted_label: 'Inactive',
  popup_fields: [],
  filters: [],
  style_by: {
    property: 'roles',
    label: 'Role',
    active_when: 'organization',
    values: [
      { value: 1, label: 'Owner' },
      { value: 2, label: 'Operator' },
    ],
    fallback_label: 'No role with this organization',
  },
};

/**
 * Renders the legend with the layer loaded into MapState.
 *
 * @return The fixture and the state.
 */
async function render(): Promise<{ fixture: ComponentFixture<Legend>; state: MapState }> {
  TestBed.configureTestingModule({
    imports: [Legend],
    providers: [{ provide: MapApi, useValue: { layers: () => of([LAYER]) } }],
  });
  const state = TestBed.inject(MapState);
  state.loadManifest();
  const fixture = TestBed.createComponent(Legend);
  await fixture.whenStable();
  return { fixture, state };
}

/**
 * Reads the legend's rows.
 *
 * @param fixture The rendered legend.
 * @return Each row's label and swatch color.
 */
function rows(fixture: ComponentFixture<Legend>): { label: string; color: string }[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map((li) => ({
    label: li.textContent!.trim(),
    color: (li.querySelector('.swatch') as HTMLElement).style.backgroundColor,
  }));
}

/**
 * Converts a hex color to the rgb() form jsdom reports for inline styles.
 *
 * @param hex A `#RRGGBB` color.
 * @return `rgb(r, g, b)`.
 */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Legend', () => {
  it('is hidden with no organization and no muted markers', async () => {
    const { fixture } = await render();
    expect((fixture.nativeElement as HTMLElement).querySelector('aside')).toBeNull();
  });

  it('lists each role with its marker color, then the fallback, while active', async () => {
    const { fixture, state } = await render();
    state.setFilter('stations', 'organization', 2);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('h2')!.textContent).toBe('Role');
    expect(rows(fixture)).toEqual([
      { label: 'Owner', color: rgb(OKABE_ITO[0]) },
      { label: 'Operator', color: rgb(OKABE_ITO[1]) },
      { label: 'No role with this organization', color: rgb(FALLBACK_COLOR) },
    ]);
  });

  it('adds the muted label when a muted marker is drawn', async () => {
    const { fixture, state } = await render();
    state.setLayerLoad('stations', { status: 'ready', count: 4, mutedCount: 1 });
    await fixture.whenStable();
    expect(rows(fixture).map((r) => r.label)).toEqual(['Inactive']);

    state.setLayerLoad('stations', { status: 'ready', count: 3, mutedCount: 0 });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('aside')).toBeNull();
  });

  it('greys out the muted swatch like a muted marker', async () => {
    const { fixture, state } = await render();
    state.setLayerLoad('stations', { status: 'ready', count: 4, mutedCount: 2 });
    await fixture.whenStable();
    const swatch = (fixture.nativeElement as HTMLElement).querySelector('.swatch') as HTMLElement;
    expect(swatch.style.opacity).toBe('0.5');
  });
});
