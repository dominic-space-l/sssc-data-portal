/**
 * @fileoverview Small text helpers shared by pages: counts with the right plural, and readable
 * names for database columns.
 */

/** Friendlier names for database columns that don't read well split up. */
const FIELD_LABELS: Record<string, string> = {
  IsActive: 'Active',
  IsRealTime: 'Real-time',
  IsSeasonal: 'Seasonal',
  'Elevation (FT)': 'Elevation (feet)',
  'PlacementHeight (Meters)': 'Placement height (meters)',
  StationTypeID: 'Station type (ID)',
  SiteID: 'Site (ID)',
  MesoWestLink: 'MesoWest link',
  Email: 'Email',
};

/** "StationCode" -> "Station code", "UpdateIntervalMinutes" -> "Update interval minutes". */
export function fieldLabel(column: string): string {
  if (FIELD_LABELS[column]) return FIELD_LABELS[column];
  const words = column
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ');
  return words.map((w, i) => (i === 0 || /^[A-Z]{2,}/.test(w) ? w : w.toLowerCase())).join(' ');
}

/** "1 row", "3 rows". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
