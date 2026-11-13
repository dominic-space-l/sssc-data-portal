/**
 * @fileoverview Types for the map API's JSON, matching the backend's API contract.
 *
 * The contract is in documentation/map/map_app_plan.md ("API contract") and is produced
 * by map/backend/src/backend/layers/base.py. Field names mirror the JSON exactly
 * (`default_visible`, `active_when`, ...), so responses need no mapping. Every type is
 * read-only: components display these values and never change them.
 *
 * Usage: `import { LayerManifest, FeatureCollection } from '../core/models';`
 */

/** Response body of `GET /api/health`. */
export interface Health {
  readonly status: string;
}

/** How a filter is shown and what values it takes. */
export type FilterType = 'boolean' | 'select' | 'multiselect';

/** One choice in a select or multiselect filter. */
export interface FilterOption {
  /** The id sent back as the filter's value. */
  readonly value: number;
  readonly label: string;
  /** Other filters this choice also sets, by filter key (a project implies its organization). */
  readonly implies?: Readonly<Record<string, number>>;
  /** A short tag shown after the label, such as "No stations". */
  readonly hint?: string;
}

/** A filter a layer accepts. Booleans have no options. */
export interface FilterDef {
  readonly key: string;
  readonly label: string;
  readonly type: FilterType;
  readonly options?: readonly FilterOption[];
}

/** A feature property shown in the marker popup. */
export interface PopupField {
  readonly key: string;
  readonly label: string;
}

/** One value a `style_by` property can take, such as a role. */
export interface StyleValue {
  readonly value: number;
  readonly label: string;
}

/** Colors markers by the values of one feature property while a filter has a value. */
export interface StyleBy {
  /** A feature property holding a list of values, such as `roles`. */
  readonly property: string;
  readonly label: string;
  /** The filter key that turns the coloring on. */
  readonly active_when: string;
  /** The possible values, in color order. */
  readonly values: readonly StyleValue[];
  /** Legend label for features whose list is empty. */
  readonly fallback_label: string;
}

/** One layer's entry in the manifest (`GET /api/layers`). */
export interface LayerManifest {
  readonly id: string;
  readonly title: string;
  readonly default_visible: boolean;
  /** Shown in popups, such as "Approximate location". */
  readonly location_note?: string;
  /** Legend label for features with `muted: true`. */
  readonly muted_label?: string;
  readonly popup_fields: readonly PopupField[];
  readonly filters: readonly FilterDef[];
  readonly style_by?: StyleBy;
}

/** Response body of `GET /api/layers`. */
export interface LayersResponse {
  readonly layers: readonly LayerManifest[];
}

/**
 * A filter's value: an id (select), ids (multiselect), a flag (boolean), or null for
 * no filter.
 */
export type FilterValue = number | readonly number[] | boolean | null;

/** Filter values for one layer, by filter key. Missing keys mean no filter. */
export type FilterValues = Readonly<Record<string, FilterValue>>;

/** A GeoJSON Point. Coordinates are `[longitude, latitude]`, already masked. */
export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: readonly [number, number];
}

/**
 * A feature's flat, display-ready properties: the popup field keys, `muted`, and the
 * `style_by` property when it applies.
 */
export interface FeatureProperties {
  readonly muted?: boolean;
  readonly [key: string]: unknown;
}

/** A GeoJSON Feature from a layer. */
export interface Feature {
  readonly type: 'Feature';
  readonly id: number;
  readonly geometry: PointGeometry;
  readonly properties: FeatureProperties;
}

/** Response body of `GET /api/layers/<layer>/features`. */
export interface FeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly Feature[];
}

/** A label/value pair in a detail section. */
export interface DetailField {
  readonly label: string;
  readonly value: unknown;
}

/** A titled block in a detail view: either fields or table rows. */
export interface DetailSection {
  readonly title: string;
  readonly fields?: readonly DetailField[];
  readonly rows?: readonly Readonly<Record<string, unknown>>[];
}

/** An external link in a detail view. */
export interface DetailLink {
  readonly label: string;
  readonly url: string;
}

/** Response body of `GET /api/layers/<layer>/features/<id>`. */
export interface Detail {
  readonly id: number;
  readonly title: string;
  readonly sections: readonly DetailSection[];
  readonly links: readonly DetailLink[];
  readonly data: Readonly<Record<string, unknown>>;
}

/** The body of every API error response. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** A failed request, reduced to what the UI needs. */
export interface ApiError {
  /** HTTP status, or 0 if the server couldn't be reached. */
  readonly status: number;
  /** The API's error code (`masking_unavailable`, ...), `network_error`, or `http_error`. */
  readonly code: string;
  /** A sentence safe to show the user. */
  readonly message: string;
}
