const clamp01 = v => Math.min(1, Math.max(0, v));
const rating = (value, worst, best) => 1 + Math.round(4 * clamp01((value - worst) / (best - worst)));

/** Escalas de referencia: el extremo izquierdo vale 1 y el derecho 5. */
const SCALES = Object.freeze({
  speed: [220, 320],
  acceleration: [170, 420],
  handling: [0.9, 1.22],
  thrusters: [8, 12.5],
  durability: [0.4, 0.9]
});

/** Cinco barras de 1 a 5 para la tarjeta de cada auto, derivadas de su ficha física. */
export function presentVehicleStats(spec) {
  const stat = (id, label, value) => ({ id, label, value, text: `${value} de 5` });
  const handling = spec.grip - (spec.cgHeight - 0.4) * 0.3 + spec.downforce * 0.02;
  const thrust = spec.thrusters.jump * 0.5 + spec.thrusters.boost * 0.4 + spec.thrusters.capacity * 3;
  return [
    stat('speed', 'Velocidad', rating(spec.topSpeed, ...SCALES.speed)),
    stat('acceleration', 'Aceleración', rating(spec.power / (spec.mass / 1000), ...SCALES.acceleration)),
    stat('handling', 'Manejo', rating(handling, ...SCALES.handling)),
    stat('thrusters', 'Propulsores', rating(thrust, ...SCALES.thrusters)),
    stat('durability', 'Resistencia', rating(spec.durability, ...SCALES.durability))
  ];
}

/** Datos técnicos cortos para la ficha del auto. */
export function presentVehicleFacts(spec) {
  const drive = { rwd: 'Tracción trasera', fwd: 'Tracción delantera', awd: 'Tracción integral' }[spec.drive];
  return [
    `${Math.round(spec.power * 1.36)} CV`,
    `${spec.mass} kg`,
    `${spec.topSpeed} km/h`,
    spec.electric ? 'Eléctrico' : `${spec.gears} marchas`,
    drive
  ];
}

const CURVE_ANGLE = 0.35;

/**
 * Resumen de una pista: largo, curvas, saltos, desnivel, perfil de altura muestreado
 * y el plano normalizado (0..1, misma escala en ambos ejes) para dibujar el minimapa.
 */
export function describeTrack(track, samples = 48, mapPoints = 160) {
  const curves = track.pieces.filter(p => p.kind === 'turn' && Math.abs(p.angle) >= CURVE_ANGLE).length;
  const step = track.length / samples;
  const heights = Array.from({ length: samples }, (_, i) => track.heightAt(i * step + step / 2));
  const solid = Array.from({ length: track.segmentCount }, (_, i) => track.segment(i)).filter(s => !s.gap);
  const all = solid.map(s => s.startHeight);
  const min = Math.min(...all);
  const range = Math.max(...all) - min;
  const b = track.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  const map = Array.from({ length: mapPoints }, (_, i) => {
    const p = track.pointAt((i / mapPoints) * track.length);
    return [(p.x - b.minX) / span, (p.y - b.minY) / span];
  });
  const jumpMarks = track.jumps.map(j => {
    const p = track.pointAt(j.lip);
    return [(p.x - b.minX) / span, (p.y - b.minY) / span];
  });
  return {
    length: `${(track.length / 1000).toFixed(2).replace('.', ',')} km`,
    curves,
    jumps: track.jumps.length,
    elevation: `${Math.round(range)} m`,
    profile: heights.map(h => (range > 0 ? Math.max(0, (h - min) / range) : 0.5)),
    bends: Array.from({ length: samples }, (_, i) => Math.max(-1, Math.min(1, track.curvatureAt(i * step) * 40))),
    map,
    aspect: [(b.maxX - b.minX) / span, (b.maxY - b.minY) / span],
    jumpMarks
  };
}
