/**
 * @fileoverview Unit tests for `FilterPanel`.
 *
 * Renders the panel from a manifest held in a real `MapState` and checks that each
 * filter type gets the right control, and that using a control writes the right value
 * to `MapState`: a dropdown's id or null for "All", ticked options in option order or
 * null when none are ticked, and true or null for a boolean.
 *
 * Usage: `npm test -w map-frontend` from the repo root.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MapApi } from '../core/map-api';
import { MapState } from '../core/map-state';
import { LayerManifest } from '../core/models';
import { FilterPanel } from './filter-panel';

const LAYER: LayerManifest = {
  id: 'stations',
  title: 'Stations',
  default_visible: true,
  popup_fields: [],
  filters: [
    {
      key: 'project',
      label: 'Project',
      type: 'select',
      options: [
        { value: 1, label: 'Project Alpha' },
        { value: 3, label: 'Project Empty', hint: 'No stations' },
      ],
    },
    {
      key: 'station_type',
      label: 'Station type',
      type: 'multiselect',
      options: [
        { value: 2, label: 'Tide gauge' },
        { value: 1, label: 'Weather station', hint: 'Retired' },
      ],
    },
    { key: 'live', label: 'Live only', type: 'boolean' },
  ],
};

/**
 * Renders the panel with the given layers loaded into MapState.
 *
 * @param layers The manifest.
 * @return The fixture and the state.
 */
async function render(
  layers: readonly LayerManifest[] = [LAYER],
): Promise<{ fixture: ComponentFixture<FilterPanel>; state: MapState }> {
  TestBed.configureTestingModule({
    imports: [FilterPanel],
    providers: [{ provide: MapApi, useValue: { layers: () => of(layers) } }],
  });
  const state = TestBed.inject(MapState);
  state.loadManifest();
  const fixture = TestBed.createComponent(FilterPanel);
  await fixture.whenStable();
  return { fixture, state };
}

/**
 * Finds an element in the panel.
 *
 * @param fixture The rendered panel.
 * @param selector A CSS selector.
 * @return The elements.
 */
function all<T extends Element>(fixture: ComponentFixture<FilterPanel>, selector: string): T[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector)];
}

/**
 * Changes a form control the way a user would.
 *
 * @param element The input or select.
 */
function change(element: HTMLInputElement | HTMLSelectElement): void {
  element.dispatchEvent(new Event('change'));
}

describe('FilterPanel', () => {
  it('renders a labelled dropdown with "All", a checkbox list, and a checkbox', async () => {
    const { fixture } = await render();

    const select = all<HTMLSelectElement>(fixture, 'select')[0];
    expect(select.id).toBe('stations-project');
    expect(
      all<HTMLLabelElement>(fixture, 'label[for="stations-project"]')[0].textContent,
    ).toContain('Project');
    expect([...select.options].map((o) => o.textContent!.trim())).toEqual([
      'All',
      'Project Alpha',
      'Project Empty — No stations',
    ]);
    expect(all(fixture, 'legend')[0].textContent).toBe('Station type');
    expect(all(fixture, 'fieldset input[type=checkbox]').length).toBe(2);
    expect(all(fixture, 'input[type=checkbox]').length).toBe(3);
  });

  it('sets a select to the chosen id, and back to null for "All"', async () => {
    const { fixture, state } = await render();
    const select = all<HTMLSelectElement>(fixture, 'select')[0];

    select.value = '3';
    change(select);
    expect(state.filtersFor('stations')['project']).toBe(3);

    select.value = '';
    change(select);
    expect(state.filtersFor('stations')['project']).toBeNull();
  });

  it('keeps ticked options in option order, and null when none are ticked', async () => {
    const { fixture, state } = await render();
    const [tide, weather] = all<HTMLInputElement>(fixture, 'fieldset input');

    weather.checked = true;
    change(weather);
    tide.checked = true;
    change(tide);
    expect(state.filtersFor('stations')['station_type']).toEqual([2, 1]);

    tide.checked = false;
    change(tide);
    weather.checked = false;
    change(weather);
    expect(state.filtersFor('stations')['station_type']).toBeNull();
  });

  it('sets a boolean to true when checked, and to no filter when unchecked', async () => {
    const { fixture, state } = await render();
    const live = all<HTMLInputElement>(fixture, 'input[type=checkbox]')[2];

    live.checked = true;
    change(live);
    expect(state.filtersFor('stations')['live']).toBe(true);

    live.checked = false;
    change(live);
    expect(state.filtersFor('stations')['live']).toBeNull();
  });

  it('reflects values already in MapState', async () => {
    const { fixture, state } = await render();
    state.setFilter('stations', 'project', 3);
    state.setFilter('stations', 'station_type', [1]);
    await fixture.whenStable();

    const select = all<HTMLSelectElement>(fixture, 'select')[0];
    expect(select.selectedOptions[0].textContent!.trim()).toBe('Project Empty — No stations');
    expect(all<HTMLInputElement>(fixture, 'fieldset input').map((i) => i.checked)).toEqual([
      false,
      true,
    ]);
  });

  it('offers "Clear filters" only while a filter is set, and it clears them', async () => {
    const { fixture, state } = await render();
    expect(all(fixture, 'button.clear')).toEqual([]);

    state.setFilter('stations', 'project', 1);
    await fixture.whenStable();
    all<HTMLButtonElement>(fixture, 'button.clear')[0].click();
    await fixture.whenStable();

    expect(state.filtersFor('stations')).toEqual({});
    expect(all(fixture, 'button.clear')).toEqual([]);
  });

  it('shows an option hint as a tag in a checkbox list', async () => {
    const { fixture } = await render();
    const tags = all(fixture, 'fieldset .hint').map((el) => el.textContent);
    expect(tags).toEqual(['Retired']);
  });

  it('renders nothing when no visible layer has filters', async () => {
    const { fixture } = await render([{ ...LAYER, filters: [] }]);
    expect(all(fixture, 'details')).toEqual([]);
  });
});
