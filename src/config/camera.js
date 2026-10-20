/**
 * Cámara de persecución en metros: altura sobre el piso, distancia detrás del auto,
 * cuántos segmentos se dibujan hacia adelante y densidad de la niebla.
 */
export const CAMERA = Object.freeze({
  height: 2.5,
  distance: 6.2,
  drawDistance: 240,
  fogDensity: 4.2,
  horizonRatio: 0.42,
  focalHeight: 0.74,
  focalWidth: 0.95,
  maxPixelRatio: 1.75,
  curveGain: 1.15,
  airLift: 0.55,
  boostFocal: 0.9
});
