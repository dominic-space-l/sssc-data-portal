/**
 * @fileoverview Type declarations for image imports.
 *
 * Image imports resolve to their emitted URL (see "loader" in angular.json).
 * Usage: `import iconUrl from 'leaflet/dist/images/marker-icon.png';`
 */

declare module '*.png' {
  const url: string;
  export default url;
}
