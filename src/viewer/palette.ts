/** Colours shared by the 3D scene and the UI (kept in sync with styles.css). */
export const ink = '#1d2721';
export const paper = '#e8ebe3';
export const sienna = '#9a6b3f';
export const flagging = '#ff3d8b';
export const cut = '#c8402e';
export const fill = '#3f8a4f';
export const neutral = '#d9d6c4';

/** Hypsometric ramp: low sage → pale khaki → warm ochre, muted like a printed site plan. */
export const elevationStops: [number, string][] = [
  [0, '#7f9c7d'],
  [0.3, '#b9c49c'],
  [0.6, '#dccfa4'],
  [1, '#b98652'],
];

/** Linework colours for drawing layers, picked by a stable hash of the layer name. */
export const layerInks = ['#1d2721', '#2f5d7c', '#6d4a8c', '#a35d1f', '#3f6e5a', '#8a3b3b', '#4b5d73', '#7b6a2a'];

/** Series colours for the profile chart and surface swatches. */
export const seriesColors = [ink, '#2f5d7c', sienna, '#6d4a8c'];

export function layerInk(name: string): string {
  if (/TOPO|CONTOUR|CONT/i.test(name)) return sienna;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return layerInks[Math.abs(h) % layerInks.length]!;
}
