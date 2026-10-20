// Image imports resolve to their emitted URL (see "loader" in angular.json)
declare module '*.png' {
  const url: string;
  export default url;
}
