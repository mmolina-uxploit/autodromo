import { createCar, stepCar, CarEvent, Assist } from './car.js';
import { planRacingLine, driveAi } from './ai.js';
import { resolveContacts } from './collision.js';
import { createLapTimer } from './lap-timer.js';
import { clamp, lerp, signedWrap } from './math.js';

export const RaceStatus = Object.freeze({
  READY: 'ready',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished'
});

export const RaceEvent = Object.freeze({
  COUNTDOWN_TICK: 'countdown-tick',
  STARTED: 'started',
  LAP_COMPLETED: 'lap-completed',
  FINAL_LAP: 'final-lap',
  POSITION_CHANGED: 'position-changed',
  COLLISION: 'collision',
  AIRBORNE: 'airborne',
  LANDED: 'landed',
  THRUST: 'thrust',
  FELL: 'fell',
  BOTTOM_OUT: 'bottom-out',
  SHIFT: 'shift',
  FINISHED: 'finished',
  RACE_OVER: 'race-over',
  PAUSED: 'paused',
  RESUMED: 'resumed'
});

export const IMPACT_SECONDS = 0.35;

const unchanged = race => ({ race, events: [] });

/**
 * Carrera nueva con la grilla armada: `entries` llega en orden de largada.
 * Cada entrada: { id, spec, model, livery, name, isPlayer, skill, assist }.
 * En modo demostración el auto del jugador maneja solo y la carrera no termina.
 */
export function createRace({ track, rules, entries, laps = 3, bestLap = null, demo = false }) {
  if (!entries?.length) throw new RangeError('La carrera necesita al menos un auto.');
  const specs = {};
  const plans = {};
  for (const entry of entries) {
    specs[entry.spec.id] = entry.spec;
    if (!plans[entry.spec.id]) plans[entry.spec.id] = planRacingLine(track, entry.spec, rules);
  }
  const L = track.length;
  const cars = entries.map((entry, k) => {
    const row = Math.floor(k / 2);
    const s = L - rules.gridFirstGap - row * rules.gridRowGap - (k % 2) * rules.gridRowGap / 2;
    return createCar({
      id: entry.id,
      spec: entry.spec,
      model: entry.model,
      livery: entry.livery,
      name: entry.name,
      s,
      n: (k % 2 ? 1 : -1) * rules.gridColumnOffset,
      progress: s - L,
      height: track.heightAt(s),
      isPlayer: Boolean(entry.isPlayer),
      autopilot: demo || !entry.isPlayer,
      skill: entry.skill ?? 1,
      assist: entry.assist ?? Assist.LIGHT
    });
  });
  const player = cars.find(c => c.isPlayer) ?? cars[0];
  return Object.freeze({
    status: demo ? RaceStatus.RUNNING : RaceStatus.READY,
    countdownTotal: rules.countdownSeconds,
    countdown: rules.countdownSeconds,
    resumeStatus: null,
    laps: demo ? Infinity : laps,
    demo,
    clock: 0,
    specs: Object.freeze(specs),
    plans: Object.freeze(plans),
    cars: Object.freeze(cars),
    playerId: player.id,
    order: Object.freeze(cars.map(c => c.id)),
    position: cars.indexOf(player) + 1,
    timer: createLapTimer(bestLap),
    finishOrder: Object.freeze([]),
    overAt: null,
    results: null,
    impact: 0
  });
}

export const playerOf = race => race.cars.find(c => c.id === race.playerId);

export function startCountdown(race) {
  if (race.status !== RaceStatus.READY) return unchanged(race);
  return {
    race: Object.freeze({ ...race, status: RaceStatus.COUNTDOWN, countdown: race.countdownTotal }),
    events: [{ type: RaceEvent.COUNTDOWN_TICK, value: Math.ceil(race.countdownTotal) }]
  };
}

export function pauseRace(race) {
  if (race.status !== RaceStatus.RUNNING && race.status !== RaceStatus.COUNTDOWN) return unchanged(race);
  return {
    race: Object.freeze({ ...race, status: RaceStatus.PAUSED, resumeStatus: race.status }),
    events: [{ type: RaceEvent.PAUSED }]
  };
}

export function resumeRace(race) {
  if (race.status !== RaceStatus.PAUSED) return unchanged(race);
  return {
    race: Object.freeze({ ...race, status: race.resumeStatus, resumeStatus: null }),
    events: [{ type: RaceEvent.RESUMED }]
  };
}

/** Avanza la carrera dt segundos. Puro: no muta el estado recibido. */
export function stepRace(race, controls, dt, world) {
  if (!(dt > 0)) return unchanged(race);
  if (race.status === RaceStatus.COUNTDOWN) return stepCountdown(race, controls, dt);
  if (race.status === RaceStatus.RUNNING) return stepRunning(race, controls, dt, world);
  return unchanged(race);
}

/** Durante la cuenta regresiva los autos quietos aceleran en vacío: solo sube el régimen. */
function revving(race, controls, dt) {
  return Object.freeze(race.cars.map(car => {
    const spec = race.specs[car.specId];
    const throttle = car.isPlayer && !car.autopilot ? controls.throttle : 0.35 + 0.3 * Math.sin(race.countdown * 5 + car.id);
    const target = spec.idle + throttle * (spec.redline * 0.7 - spec.idle);
    return Object.freeze({ ...car, throttle, rpm: car.rpm + (target - car.rpm) * clamp(dt * 8, 0, 1) });
  }));
}

function stepCountdown(race, controls, dt) {
  const remaining = race.countdown - dt;
  const cars = revving(race, controls, dt);
  if (remaining <= 0) {
    return {
      race: Object.freeze({ ...race, cars, status: RaceStatus.RUNNING, countdown: 0 }),
      events: [{ type: RaceEvent.STARTED }]
    };
  }
  const events = Math.ceil(remaining) < Math.ceil(race.countdown)
    ? [{ type: RaceEvent.COUNTDOWN_TICK, value: Math.ceil(remaining) }]
    : [];
  return { race: Object.freeze({ ...race, cars, countdown: remaining }), events };
}

const CAR_EVENT_MAP = Object.freeze({
  [CarEvent.WALL]: RaceEvent.COLLISION,
  [CarEvent.LAUNCH]: RaceEvent.AIRBORNE,
  [CarEvent.LAND]: RaceEvent.LANDED,
  [CarEvent.THRUST_JUMP]: RaceEvent.THRUST,
  [CarEvent.FELL]: RaceEvent.FELL,
  [CarEvent.BOTTOM_OUT]: RaceEvent.BOTTOM_OUT,
  [CarEvent.SHIFT]: RaceEvent.SHIFT
});

function standings(cars) {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });
}

/** Registra vueltas completas; devuelve el auto y los eventos que generó. */
function countLaps(car, clock, race, track) {
  const completed = Math.max(0, Math.floor(car.progress / track.length));
  if (completed <= car.lap) return { car, events: [] };
  const time = clock - car.lapStart;
  const events = [];
  let next = { ...car, lap: completed, lapStart: clock, lastLap: time, bestLap: car.bestLap === null ? time : Math.min(car.bestLap, time) };
  if (car.isPlayer) {
    const best = race.timer.best;
    events.push({ type: RaceEvent.LAP_COMPLETED, lap: completed, time, isBest: best === null || time < best });
    if (completed === race.laps - 1) events.push({ type: RaceEvent.FINAL_LAP });
  }
  if (completed >= race.laps && !car.finished) {
    next = { ...next, finished: true, finishTime: clock, autopilot: true };
    events.push({ type: RaceEvent.FINISHED, carId: car.id, player: car.isPlayer, time: clock });
  }
  return { car: Object.freeze(next), events };
}

/** Resultado final: los que no llegaron reciben un tiempo estimado por lo que les faltaba. */
export function raceResults(race, track) {
  const winner = standings(race.cars)[0];
  const pace = winner.progress / Math.max(1, race.clock);
  return standings(race.cars).map((car, index) => {
    const remaining = Math.max(0, race.laps * track.length - car.progress);
    const time = car.finished ? car.finishTime : race.clock + remaining / Math.max(10, pace * 0.95);
    return Object.freeze({
      position: index + 1,
      id: car.id,
      name: car.name,
      model: car.model,
      livery: car.livery,
      isPlayer: car.isPlayer,
      finished: car.finished,
      time,
      bestLap: car.bestLap
    });
  });
}

function stepRunning(race, controls, dt, { track, rules }) {
  const steps = clamp(Math.ceil(dt / rules.physicsStep - 1e-9), 1, rules.maxSubsteps);
  const h = dt / steps;
  const specOf = car => race.specs[car.specId];
  let cars = race.cars;
  let clock = race.clock;
  const raw = [];

  let before = cars;
  for (let k = 0; k < steps; k++) {
    const snapshot = cars;
    before = snapshot;
    cars = snapshot.map(car => {
      const spec = specOf(car);
      let input = controls;
      let ai = car.ai;
      if (!car.isPlayer || car.autopilot) {
        const auto = driveAi(car, { plan: race.plans[car.specId], track, spec, cars: snapshot, clock, h });
        input = auto.controls;
        ai = auto.ai;
      }
      const moved = stepCar({ ...car, ai }, input, spec, track, rules, h);
      for (const e of moved.events) {
        const type = CAR_EVENT_MAP[e.type];
        if (type) raw.push({ ...e, type, kind: e.type === CarEvent.WALL ? 'wall' : undefined, carId: car.id, player: car.isPlayer });
      }
      return moved.car;
    });
    const contact = resolveContacts(cars, specOf, track, rules);
    cars = contact.cars;
    for (const e of contact.events) {
      const player = e.a === race.playerId || e.b === race.playerId;
      raw.push({ type: RaceEvent.COLLISION, kind: 'car', carId: e.a, otherId: e.b, intensity: e.intensity, player });
    }
    clock += h;
    cars = cars.map(car => {
      const lap = countLaps(car, clock, race, track);
      raw.push(...lap.events);
      return lap.car;
    });
  }

  const events = dedupe(raw);
  const order = standings(cars);
  const player = cars.find(c => c.id === race.playerId);
  const position = order.indexOf(player) + 1;
  if (!race.demo && position !== race.position) events.push({ type: RaceEvent.POSITION_CHANGED, position, previous: race.position, total: cars.length });

  const timerBest = events.reduce((best, e) => (e.type === RaceEvent.LAP_COMPLETED && e.isBest ? e.time : best), race.timer.best);
  const lastLap = events.filter(e => e.type === RaceEvent.LAP_COMPLETED).at(-1)?.time ?? race.timer.last;
  const timer = Object.freeze({
    lap: Math.min(player.lap + 1, race.laps),
    current: clock - player.lapStart,
    best: timerBest,
    last: lastLap
  });

  const hitPlayer = events.some(e => e.type === RaceEvent.COLLISION && e.player && e.intensity > 2);
  let next = {
    ...race,
    cars: Object.freeze(cars),
    clock,
    order: Object.freeze(order.map(c => c.id)),
    position,
    timer,
    finishOrder: Object.freeze(order.filter(c => c.finished).map(c => c.id)),
    impact: hitPlayer ? IMPACT_SECONDS : Math.max(0, race.impact - dt)
  };

  if (!race.demo) {
    const overAt = race.overAt ?? (player.finished ? clock + rules.finishGraceSeconds : null);
    const everyone = cars.every(c => c.finished);
    next = { ...next, overAt };
    if (overAt !== null && (everyone || clock >= overAt)) {
      const results = raceResults({ ...next, clock }, track);
      next = { ...next, status: RaceStatus.FINISHED, results: Object.freeze(results) };
      events.push({ type: RaceEvent.RACE_OVER, results });
    }
  }
  return { race: Object.freeze(next), events, previous: before };
}

const BLEND = ['n', 'z', 'psi', 'u', 'v', 'r', 'steer', 'rpm', 'progress', 'ax', 'ay', 'energy', 'boostLevel', 'liftLevel'];

/**
 * Estado para dibujar entre dos pasos de física: cada auto a mitad de camino entre su posición
 * del paso anterior (`previousCars`) y la actual, según `alpha` (0 = anterior, 1 = actual).
 * Así el movimiento se ve parejo aunque los cuadros no coincidan con los pasos. Un auto que
 * reapareció lejos no se interpola.
 */
export function interpolateRace(race, previousCars, alpha, track) {
  if (!previousCars || alpha >= 1 || previousCars === race.cars) return race;
  const t = clamp(alpha, 0, 1);
  const cars = race.cars.map((car, i) => {
    const prev = previousCars[i];
    if (!prev || prev.id !== car.id) return car;
    const ds = signedWrap(car.s - prev.s, track.length);
    if (Math.abs(ds) > 15) return car;
    const mixed = { ...car, s: track.wrap(prev.s + ds * t) };
    for (const key of BLEND) {
      if (typeof car[key] === 'number' && typeof prev[key] === 'number') mixed[key] = lerp(prev[key], car[key], t);
    }
    mixed.susp = Object.freeze({
      ...car.susp,
      heave: lerp(prev.susp.heave, car.susp.heave, t),
      pitch: lerp(prev.susp.pitch, car.susp.pitch, t),
      roll: lerp(prev.susp.roll, car.susp.roll, t)
    });
    return Object.freeze(mixed);
  });
  return Object.freeze({ ...race, cars: Object.freeze(cars) });
}

/** Un mismo choque o aterrizaje puede aparecer en varios subpasos: queda el más fuerte por auto. */
function dedupe(events) {
  const keep = new Map();
  const out = [];
  for (const e of events) {
    if (e.type === RaceEvent.COLLISION || e.type === RaceEvent.LANDED || e.type === RaceEvent.BOTTOM_OUT) {
      const key = `${e.type}:${e.kind ?? ''}:${e.carId}:${e.otherId ?? ''}`;
      const prev = keep.get(key);
      if (!prev) {
        keep.set(key, e);
        out.push(e);
      } else if ((e.intensity ?? e.impact ?? 0) > (prev.intensity ?? prev.impact ?? 0)) {
        out[out.indexOf(prev)] = e;
        keep.set(key, e);
      }
    } else {
      out.push(e);
    }
  }
  return out;
}
