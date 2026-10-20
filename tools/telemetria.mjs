/**
 * Telemetría de suavidad y costo del motor, sin navegador. Mide lo que se siente brusco:
 * tirones de aceleración (jerk), giros que vibran, volante y pedales que titubean,
 * saltitos en lomas, golpes de suspensión, roces con defensas y entre autos, y cuánto
 * cambia la física según los cuadros por segundo. También mide cuánto cuesta cada cuadro.
 *
 * Uso: node tools/telemetria.mjs [archivo.json]   (sin archivo solo imprime)
 */
import { writeFileSync } from 'node:fs';
import { Track } from '../src/domain/track.js';
import { createVehicleSpec } from '../src/domain/vehicle.js';
import { createRace, startCountdown, stepRace, RaceStatus } from '../src/domain/race.js';
import { planRacingLine } from '../src/domain/ai.js';
import { Assist } from '../src/domain/car.js';
import { createControls } from '../src/domain/controls.js';
import { TRACKS, trackOptions } from '../src/config/tracks.js';
import { VEHICLES } from '../src/config/vehicles.js';
import { createRules } from '../src/config/rules.js';

const rules = createRules();
const h = rules.physicsStep;
const specs = Object.fromEntries(VEHICLES.map(v => [v.id, createVehicleSpec(v.id, v.physics)]));
const worlds = TRACKS.map(def => ({ id: def.id, track: Track.fromLayout(def.layout, trackOptions(def, rules)) }));

const rms = xs => (xs.length ? Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length) : 0);
const pct = (xs, p) => {
  if (!xs.length) return 0;
  const sorted = [...xs].map(Math.abs).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const round = (x, d = 2) => Number(x.toFixed(d));

/** Acumula series de un auto paso a paso y las resume. */
function recorder() {
  const series = { jx: [], jy: [], yawAcc: [], heaveAcc: [], pitchV: [], rollV: [] };
  let prev = null;
  let steerFlips = 0;
  let pedalFlips = 0;
  let lastSteerDir = 0;
  let lastPedal = 0;
  let launches = 0;
  let microHops = 0;
  let airStart = null;
  let time = 0;
  return {
    add(car, onJump) {
      if (prev) {
        series.jx.push((car.ax - prev.ax) / h);
        series.jy.push((car.ay - prev.ay) / h);
        series.yawAcc.push((car.r - prev.r) / h);
        series.heaveAcc.push((car.susp.heaveV - prev.susp.heaveV) / h);
        series.pitchV.push(car.susp.pitchV);
        series.rollV.push(car.susp.rollV);
        const ds = car.steer - prev.steer;
        const dir = Math.abs(ds) > 1e-4 ? Math.sign(ds) : 0;
        if (dir && lastSteerDir && dir !== lastSteerDir) steerFlips++;
        if (dir) lastSteerDir = dir;
        const pedal = car.brake > 0 ? -1 : car.throttle > 0.05 ? 1 : 0;
        if (pedal && lastPedal && pedal !== lastPedal) pedalFlips++;
        if (pedal) lastPedal = pedal;
        if (car.airborne && !prev.airborne) { launches++; airStart = { t: time, jump: onJump }; }
        if (!car.airborne && prev.airborne && airStart) {
          if (time - airStart.t < 0.2 && !airStart.jump) microHops++;
          airStart = null;
        }
      }
      prev = car;
      time += h;
    },
    summary(minutes) {
      return {
        jerkLongRms: round(rms(series.jx), 1),
        jerkLongP999: round(pct(series.jx, 0.999), 0),
        jerkLatRms: round(rms(series.jy), 1),
        jerkLatP999: round(pct(series.jy, 0.999), 0),
        yawAccRms: round(rms(series.yawAcc), 2),
        yawAccP999: round(pct(series.yawAcc, 0.999), 1),
        heaveAccRms: round(rms(series.heaveAcc), 1),
        pitchVRms: round(rms(series.pitchV), 3),
        rollVRms: round(rms(series.rollV), 3),
        steerFlipsPerMin: round(steerFlips / minutes, 1),
        pedalFlipsPerMin: round(pedalFlips / minutes, 1),
        launches,
        microHops
      };
    }
  };
}

const mean = (rows, key) => round(rows.reduce((a, r) => a + r[key], 0) / rows.length, 2);

/** A. Carrera con IA en cada pista: todos los autos manejan solos, paso a paso. */
function aiRaces(laps = 2) {
  const out = {};
  for (const { id, track } of worlds) {
    const entries = Array.from({ length: 6 }, (_, i) => {
      const v = VEHICLES[i % VEHICLES.length];
      return { id: i, spec: specs[v.id], model: v.model, livery: v.liveries[0].id, name: v.name, isPlayer: i === 0, skill: i === 0 ? 1 : 0.93 };
    });
    let race = createRace({ track, rules, entries, laps });
    race = { ...race, cars: race.cars.map(c => ({ ...c, autopilot: true })) };
    race = startCountdown(race).race;
    const recs = new Map(race.cars.map(c => [c.id, recorder()]));
    let walls = 0;
    let contacts = 0;
    let steps = 0;
    while (race.status !== RaceStatus.FINISHED && steps < 120 * 600) {
      const { race: next, events } = stepRace(race, createControls(), h, { track, rules });
      for (const e of events) {
        if (e.type === 'collision' && e.kind === 'wall') walls++;
        if (e.type === 'collision' && e.kind === 'car') contacts++;
      }
      race = next;
      if (race.status === RaceStatus.RUNNING || race.status === RaceStatus.FINISHED) {
        for (const car of race.cars) if (!car.finished) recs.get(car.id).add(car, Boolean(track.jumpAt(car.s)));
      }
      steps++;
    }
    const minutes = race.clock / 60;
    const rows = race.cars.map(car => ({ ...recs.get(car.id).summary(minutes), bestLap: car.bestLap ?? 0 }));
    const summary = {};
    for (const key of Object.keys(rows[0])) summary[key] = mean(rows, key);
    summary.wallHitsPerLap = round(walls / (laps * race.cars.length), 2);
    summary.carContactsPerLap = round(contacts / (laps * race.cars.length), 2);
    summary.bestLaps = race.cars.map(c => round(c.bestLap ?? 0, 2));
    out[id] = summary;
  }
  return out;
}

/** Guion de manejo con teclado (todo o nada) en función del tiempo. */
function keyboardScript(t) {
  const steer = t > 8 && t < 16 ? (Math.floor((t - 8) / 0.6) % 3 === 0 ? 1 : Math.floor((t - 8) / 0.6) % 3 === 1 ? -1 : 0) : 0;
  const brake = (t > 6 && t < 7.2) || (t > 17 && t < 18) ? 1 : 0;
  const throttle = brake ? 0 : t < 6 || (t > 7.5 && t < 17) || t > 18.5 ? 1 : 0;
  return createControls({ steer, throttle, brake });
}

function soloRace(world, specId, assist) {
  const entries = [{ id: 0, spec: specs[specId], model: specId, livery: null, name: specId, isPlayer: true, assist }];
  let race = createRace({ track: world.track, rules, entries, laps: 99 });
  race = startCountdown(race).race;
  while (race.status !== RaceStatus.RUNNING) race = stepRace(race, createControls(), 1 / 60, { track: world.track, rules }).race;
  return race;
}

/** B. Jugador con teclado: pisa, frena y zigzaguea con cada auto, con ayudas ligeras y sin ayudas. */
function keyboardDriving(seconds = 20) {
  const world = worlds.find(w => w.id === 'costa-rosa');
  const out = {};
  for (const assist of [Assist.LIGHT, Assist.NONE]) {
    for (const specId of Object.keys(specs)) {
      let race = soloRace(world, specId, assist);
      const rec = recorder();
      let walls = 0;
      for (let t = 0; t < seconds; t += h) {
        const result = stepRace(race, keyboardScript(t), h, { track: world.track, rules });
        walls += result.events.filter(e => e.kind === 'wall').length;
        race = result.race;
        rec.add(race.cars[0], false);
      }
      out[`${specId}/${assist === Assist.NONE ? 'sin-ayudas' : 'ayudas'}`] = { ...rec.summary(seconds / 60), walls, distance: round(race.cars[0].progress, 0) };
    }
  }
  return out;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** C. Misma conducción a distintos cuadros por segundo: cuánto se aparta del paso de referencia. */
function frameRateIndependence(seconds = 20) {
  const world = worlds.find(w => w.id === 'costa-rosa');
  const run = frame => {
    let race = soloRace(world, 'volta', Assist.LIGHT);
    let t = 0;
    while (t < seconds) {
      const dt = Math.min(frame(), seconds - t);
      race = stepRace(race, keyboardScript(t), dt, { track: world.track, rules }).race;
      t += dt;
    }
    const car = race.cars[0];
    return { progress: car.progress, n: car.n, u: car.u };
  };
  const reference = run(() => h);
  const out = {};
  const rnd = mulberry(7);
  const cases = {
    '30 Hz': () => 1 / 30,
    '50 Hz': () => 1 / 50,
    '60 Hz': () => 1 / 60,
    '60 Hz irregular': () => (1 / 60) * (0.75 + rnd() * 0.5),
    '144 Hz': () => 1 / 144
  };
  for (const [name, frame] of Object.entries(cases)) {
    const r = run(frame);
    out[name] = { avanceM: round(r.progress - reference.progress, 2), lateralM: round(r.n - reference.n, 3), velocidad: round(r.u - reference.u, 3) };
  }
  return out;
}

/** D. Costo: un cuadro de 60 Hz con 8 autos, y el plan de línea de carrera. */
function cost() {
  const world = worlds.find(w => w.id === 'anillo-neon');
  const entries = Array.from({ length: 8 }, (_, i) => {
    const v = VEHICLES[i % VEHICLES.length];
    return { id: i, spec: specs[v.id], model: v.model, livery: v.liveries[0].id, name: v.name, isPlayer: i === 0, skill: 0.95 };
  });
  let race = createRace({ track: world.track, rules, entries, laps: 99 });
  race = { ...race, cars: race.cars.map(c => ({ ...c, autopilot: true })) };
  race = startCountdown(race).race;
  for (let i = 0; i < 300; i++) race = stepRace(race, createControls(), 1 / 60, { track: world.track, rules }).race;
  const frames = 3600;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) race = stepRace(race, createControls(), 1 / 60, { track: world.track, rules }).race;
  const frameMs = (performance.now() - t0) / frames;
  const t1 = performance.now();
  for (const spec of Object.values(specs)) planRacingLine(world.track, spec, rules);
  const planMs = (performance.now() - t1) / Object.keys(specs).length;
  return { msPorCuadro8Autos: round(frameMs, 3), msPorPlanDeLinea: round(planMs, 1) };
}

const report = { ia: aiRaces(), teclado: keyboardDriving(), cuadrosPorSegundo: frameRateIndependence(), costo: cost() };
console.log(JSON.stringify(report, null, 1));
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
