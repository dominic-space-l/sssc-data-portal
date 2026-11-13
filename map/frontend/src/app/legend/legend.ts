/**
 * @fileoverview Map legend: explains marker colors and greyed-out markers.
 *
 * For each visible layer, it shows the layer's `style_by` colors (one swatch per value,
 * plus the fallback) while `style_by.active_when` has a value, and the layer's
 * `muted_label` whenever any muted marker is drawn. Generic: it reads only the manifest
 * and `MapState`, and uses the same colors as the markers (`layers/style-by.ts`).
 *
 * Usage: `<map-legend />` (MapView places it over the map).
 */

import { Component, computed, inject } from '@angular/core';
import { MapState } from '../core/map-state';
import { MUTED_OPACITY, MUTED_OUTLINE_COLOR } from '../layers/markers';
import { FALLBACK_COLOR } from '../layers/registry';
import { isStyleByActive, styleByEntries } from '../layers/style-by';

/** Fill of the swatch for muted markers: a neutral gray, drawn like a muted marker. */
const MUTED_SWATCH = '#BDBDBD';

/** One row of the legend. */
interface LegendRow {
  readonly label: string;
  readonly color: string;
  /** Draw the swatch greyed out, like a muted marker. */
  readonly muted?: boolean;
}

/** One layer's block in the legend. */
interface LegendSection {
  readonly layerId: string;
  /** The heading: the `style_by` label (e.g. "Role"), or the layer title. */
  readonly title: string;
  readonly rows: readonly LegendRow[];
}

/** Legend overlay, shown only when there's something to explain. */
@Component({
  selector: 'map-legend',
  templateUrl: './legend.html',
  styleUrl: './legend.scss',
})
export class Legend {
  private readonly state = inject(MapState);

  /** Muted swatches use the muted markers' outline and opacity. */
  protected readonly mutedOutline = MUTED_OUTLINE_COLOR;
  protected readonly mutedOpacity = MUTED_OPACITY;

  /** A section for each visible layer with active colors or muted markers. */
  protected readonly sections = computed<readonly LegendSection[]>(() =>
    this.state.visibleLayers().flatMap((layer) => {
      const rows: LegendRow[] = [];
      if (layer.style_by && isStyleByActive(layer, this.state.filtersFor(layer.id))) {
        rows.push(...styleByEntries(layer).map(({ label, color }) => ({ label, color })));
        rows.push({ label: layer.style_by.fallback_label, color: FALLBACK_COLOR });
      }
      const load = this.state.layerLoads()[layer.id];
      if (layer.muted_label && load?.status === 'ready' && (load.mutedCount ?? 0) > 0) {
        rows.push({ label: layer.muted_label, color: MUTED_SWATCH, muted: true });
      }
      if (rows.length === 0) {
        return [];
      }
      const title = rows[0].muted ? layer.title : (layer.style_by?.label ?? layer.title);
      return [{ layerId: layer.id, title, rows }];
    }),
  );
}
