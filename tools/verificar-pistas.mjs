/**
 * Verifica los trazados de config/tracks.js: cierre, radio mínimo, separación entre tramos
 * no vecinos y velocidad mínima de cada salto. Con --png escribe un JSON de puntos para dibujar.
 * Uso: node tools/verificar-pistas.mjs [--json salida.json]
 */
import { writeFileSync } from 'node:fs';
import { Track } from '../src/domain/track.js';
import { TRACKS, trackOptions } from '../src/config/tracks.js';
import { createRules } from '../src/config/rules.js';

const rules = createRules();
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const dump = {};
let failed = false;

for (const def of TRACKS) {
  let track;
  try {
    track = Track.fromLayout(def.layout, trackOptions(def, rules));
  } catch (error) {
    console.log(`✗ ${def.id}: ${error.message}`);
    failed = true;
    continue;
  }
  const n = track.segmentCount;
  const sep = Math.ceil(120 / track.segmentLength);
  let worst = Infinity;
  for (let i = 0; i < n; i += 2) {
    const a = track.segment(i);
    for (let j = i + sep; j < n; j += 2) {
      if (n - (j - i) < sep) continue;
      const b = track.segment(j);
      worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  const end = track.pointAt(track.length - 1e-9);
  const rmin = 1 / Math.max(...Array.from({ length: n }, (_, i) => Math.abs(track.segment(i).curvature)));
  const clear = worst > track.barrier * 2 + 4;
  if (!clear) failed = true;
  console.log(`${clear ? '✓' : '✗'} ${def.id}: ${(track.length / 1000).toFixed(2)} km, cierre ${Math.hypot(end.x, end.y).toFixed(2)} m, radio mínimo ${rmin.toFixed(0)} m, separación mínima ${worst.toFixed(0)} m (barrera ${track.barrier} m)`);
  console.log(`   saltos: ${track.jumps.map(j => `${j.lip.toFixed(0)} m → ${(j.requiredSpeed * 3.6).toFixed(0)} km/h`).join(' · ') || 'ninguno'}`);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = track.segment(i % n);
    pts.push([s.x, s.y]);
  }
  dump[def.id] = { pts, marks: track.jumps.map((j, k) => ({ idx: `J${k}`, ...track.pointAt(j.lip), kind: 'jump', adjust: false })), gap: [0, 0], heading: 360 };
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(dump));
process.exitCode = failed ? 1 : 0;
