/**
 * Carrera completa sin navegador: el auto del jugador maneja solo. Uso:
 * node tools/carrera.mjs [pista] [vueltas] [rivales] [habilidad]
 */
import { Track } from '../src/domain/track.js';
import { createVehicleSpec } from '../src/domain/vehicle.js';
import { createRace, startCountdown, stepRace, RaceStatus, RaceEvent } from '../src/domain/race.js';
import { createControls } from '../src/domain/controls.js';
import { TRACKS, trackOptions } from '../src/config/tracks.js';
import { VEHICLES } from '../src/config/vehicles.js';
import { createRules } from '../src/config/rules.js';

const [trackId = 'bajo-autopista', laps = '2', rivals = '5', skill = '0.95'] = process.argv.slice(2);
const rules = createRules();
const def = TRACKS.find(t => t.id === trackId);
const track = Track.fromLayout(def.layout, trackOptions(def, rules));
const specs = Object.fromEntries(VEHICLES.map(v => [v.id, createVehicleSpec(v.id, v.physics)]));
const entries = Array.from({ length: Number(rivals) + 1 }, (_, i) => {
  const v = VEHICLES[i % VEHICLES.length];
  return { id: i, spec: specs[v.id], model: v.model, livery: v.liveries[0].id, name: `${v.name} ${i}`, isPlayer: i === 0, skill: i === 0 ? 1 : Number(skill) };
});
let race = createRace({ track, rules, entries, laps: Number(laps) });
race = { ...race, cars: race.cars.map(c => ({ ...c, autopilot: true })) };
race = startCountdown(race).race;
const counts = {};
const t0 = performance.now();
let frames = 0;
while (race.status !== RaceStatus.FINISHED && frames < 60 * 900) {
  const { race: next, events } = stepRace(race, createControls(), 1 / 60, { track, rules });
  for (const e of events) counts[e.type + (e.kind ? ':' + e.kind : '')] = (counts[e.type + (e.kind ? ':' + e.kind : '')] ?? 0) + 1;
  race = next;
  frames++;
}
const ms = performance.now() - t0;
console.log(`${trackId}: ${frames} cuadros simulados en ${ms.toFixed(0)} ms (${(ms / frames).toFixed(2)} ms/cuadro)`);
console.log('eventos', counts);
for (const r of race.results ?? []) console.log(`${r.position}. ${r.name.padEnd(10)} ${r.time.toFixed(1)} s ${r.finished ? '' : '(estimado)'} mejor ${r.bestLap?.toFixed(1)}`);
