/**
 * @fileoverview Filter panel: one control per filter in the manifest, for each visible layer.
 *
 * Generic: it renders whatever `FilterDef`s the backend sends and knows no layer or
 * filter by name. A `boolean` is a checkbox (checked means true, unchecked means no
 * filter), a `select` is a dropdown with an "All" entry, and a `multiselect` is a list
 * of checkboxes. Values go to `MapState`, which makes `MapView` redraw the layer.
 *
 * Usage: `<map-filter-panel />` (MapView places it over the map).
 */

import { Component, computed, inject } from '@angular/core';
import { MapState } from '../core/map-state';
import { FilterDef, FilterOption, FilterValue, LayerManifest } from '../core/models';

/** Collapsible panel of filter controls, built from the manifest. */
@Component({
  selector: 'map-filter-panel',
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.scss',
})
export class FilterPanel {
  private readonly state = inject(MapState);

  /** Visible layers that have at least one filter. */
  protected readonly layers = computed(() =>
    this.state.visibleLayers().filter((layer) => layer.filters.length > 0),
  );

  /**
   * Returns a filter's current value.
   *
   * @param layer The layer.
   * @param filter The filter.
   * @return Its value, or null when unset.
   */
  protected valueOf(layer: LayerManifest, filter: FilterDef): FilterValue {
    return this.state.filtersFor(layer.id)[filter.key] ?? null;
  }

  /**
   * Returns a select's current value as the dropdown's string value.
   *
   * @param layer The layer.
   * @param filter A select filter.
   * @return The selected id as a string, or '' for "All".
   */
  protected selectValue(layer: LayerManifest, filter: FilterDef): string {
    const value = this.valueOf(layer, filter);
    return typeof value === 'number' ? String(value) : '';
  }

  /**
   * Whether a multiselect option is ticked.
   *
   * @param layer The layer.
   * @param filter A multiselect filter.
   * @param option One of its options.
   * @return True if the option's value is selected.
   */
  protected isTicked(layer: LayerManifest, filter: FilterDef, option: FilterOption): boolean {
    const value = this.valueOf(layer, filter);
    return Array.isArray(value) && value.includes(option.value);
  }

  /**
   * Whether any filter on the layer has a value, so "Clear" is worth showing.
   *
   * @param layer The layer.
   * @return True if a filter is set.
   */
  protected hasFilters(layer: LayerManifest): boolean {
    return layer.filters.some((filter) => this.valueOf(layer, filter) !== null);
  }

  /**
   * Handles a dropdown change.
   *
   * @param layer The layer.
   * @param filter The select filter.
   * @param event The change event from the `<select>`.
   */
  protected onSelect(layer: LayerManifest, filter: FilterDef, event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.state.setFilter(layer.id, filter.key, raw === '' ? null : Number(raw));
  }

  /**
   * Handles ticking or unticking a multiselect option. Values stay in option order.
   *
   * @param layer The layer.
   * @param filter The multiselect filter.
   * @param option The option toggled.
   * @param event The change event from its checkbox.
   */
  protected onTick(
    layer: LayerManifest,
    filter: FilterDef,
    option: FilterOption,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ticked = (filter.options ?? [])
      .filter((o) => (o.value === option.value ? checked : this.isTicked(layer, filter, o)))
      .map((o) => o.value);
    this.state.setFilter(layer.id, filter.key, ticked);
  }

  /**
   * Handles a boolean checkbox. Unchecked means no filter, not false.
   *
   * @param layer The layer.
   * @param filter The boolean filter.
   * @param event The change event from the checkbox.
   */
  protected onToggle(layer: LayerManifest, filter: FilterDef, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.state.setFilter(layer.id, filter.key, checked ? true : null);
  }

  /**
   * Clears every filter on a layer.
   *
   * @param layer The layer.
   */
  protected clear(layer: LayerManifest): void {
    this.state.clearFilters(layer.id);
  }
}
