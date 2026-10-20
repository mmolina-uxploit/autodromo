/**
 * Simulación sin navegador: un auto con piloto automático da vueltas en cada pista.
 * Sirve para calibrar la física y la IA. Uso: node tools/simular.mjs [auto] [vueltas]
 */
import { Track } from '../src/domain/track.js';
import { createVehicleSpec } from '../src/domain/vehicle.js';
import { createCar, stepCar, CarEvent } from '../src/domain/car.js';
import { planRacingLine, driveAi } from '../src/domain/ai.js';
import { TRACKS, trackOptions } from '../src/config/tracks.js';
import { VEHICLES } from '../src/config/vehicles.js';
import { createRules } from '../src/config/rules.js';

const rules = createRules();
const wanted = process.argv[2];
const laps = Number(process.argv[3] ?? 2);
const vehicles = VEHICLES.filter(v => !wanted || v.id === wanted);

for (const def of TRACKS) {
  const track = Track.fromLayout(def.layout, trackOptions(def, rules));
  for (const vehicle of vehicles) {
    const spec = createVehicleSpec(vehicle.id, vehicle.physics);
    const plan = planRacingLine(track, spec, rules);
    let car = createCar({ id: 1, spec, s: track.length - 10, progress: -10, skill: 1 });
    const h = rules.physicsStep;
    let clock = 0;
    const stats = { wall: 0, fell: 0, launches: 0, maxAir: 0, top: 0, lapTimes: [], lastLapAt: 0, jumps: 0, bottom: 0, maxSlip: 0, minEnergy: 1 };
    while (car.progress < laps * track.length && clock < 600) {
      const { controls, ai } = driveAi(car, { plan, track, spec, cars: [car], clock, h });
      const before = Math.floor(car.progress / track.length);
      const result = stepCar({ ...car, ai }, controls, spec, track, rules, h);
      car = result.car;
      clock += h;
      for (const e of result.events) {
        if (e.type === CarEvent.WALL) stats.wall++;
        if (e.type === CarEvent.FELL) stats.fell++;
        if (e.type === CarEvent.LAUNCH) stats.launches++;
        if (e.type === CarEvent.THRUST_JUMP) stats.jumps++;
        if (e.type === CarEvent.BOTTOM_OUT) stats.bottom++;
        if (e.type === CarEvent.LAND) stats.maxAir = Math.max(stats.maxAir, e.airTime);
      }
      stats.top = Math.max(stats.top, car.u);
      stats.maxSlip = Math.max(stats.maxSlip, car.slip);
      stats.minEnergy = Math.min(stats.minEnergy, car.energy);
      const after = Math.floor(car.progress / track.length);
      if (after > before && after >= 1) {
        stats.lapTimes.push((clock - stats.lastLapAt).toFixed(1));
        stats.lastLapAt = clock;
      }
    }
    console.log(`${def.id.padEnd(15)} ${vehicle.id.padEnd(7)} vueltas ${stats.lapTimes.join(' / ')} s · punta ${(stats.top * 3.6).toFixed(0)} km/h · defensas ${stats.wall} · caídas ${stats.fell} · vuelos ${stats.launches} (máx ${stats.maxAir.toFixed(2)} s) · saltos con propulsor ${stats.jumps} · topes ${stats.bottom} · energía mín ${stats.minEnergy.toFixed(2)}${clock >= 600 ? ' · ¡NO TERMINÓ!' : ''}`);
  }
}
