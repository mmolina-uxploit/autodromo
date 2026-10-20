import {
  createRace, startCountdown, stepRace, pauseRace, resumeRace, interpolateRace, RaceStatus, RaceEvent
} from '../domain/race.js';
import { Assist } from '../domain/car.js';
import { NEUTRAL_CONTROLS } from '../domain/controls.js';
import { toControls } from './controls-mapper.js';
import { SessionEvent } from './race-events.js';

const COLLISION_PULSE_MS = 40;
const ASSISTS = Object.freeze({ completa: Assist.FULL, ligera: Assist.LIGHT, ninguna: Assist.NONE });
const DEMO_RIVALS = 6;

export const bestLapKey = (trackId, vehicleId) => `${trackId}/${vehicleId}`;

/** Mezcla determinista (Fisher-Yates) con el generador de la sesión. */
function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Caso de uso principal: ciclo de vida de una carrera con la pista, el auto y las reglas elegidas.
 * Arma la grilla (jugador más rivales según la dificultad), orquesta el dominio y delega
 * efectos (persistencia, vibración) en puertos. También corre la carrera de demostración
 * que se ve detrás del menú.
 */
export function createRaceSession({
  tracks, vehicles, specs, difficulties, rivalNames = [], rules, createRng,
  bestLapRepository, haptics, getSettings, raceFactory = createRace
}) {
  const listeners = new Set();
  let demo = false;
  let world = worldFor(getSettings());
  let race = newRace();
  // Paso fijo: el tiempo de cada cuadro se acumula y la física avanza en pasos enteros.
  // Lo que sobra (alpha) sirve para dibujar entre el paso anterior y el actual.
  let accumulator = 0;
  let previousCars = race.cars;

  function worldFor(settings) {
    const trackId = tracks.has(settings.track) ? settings.track : tracks.keys().next().value;
    const vehicle = vehicles.find(v => v.id === settings.vehicle) ?? vehicles[0];
    const livery = vehicle.liveries.find(l => l.id === settings.livery) ?? vehicle.liveries[0];
    const difficulty = difficulties.find(d => d.id === settings.difficulty) ?? difficulties[0];
    return Object.freeze({
      trackId,
      track: tracks.get(trackId),
      vehicleId: vehicle.id,
      liveryId: livery.id,
      laps: settings.laps ?? 3,
      rivals: Math.min(settings.rivals ?? 5, rules.maxRivals),
      difficulty,
      recordKey: bestLapKey(trackId, vehicle.id),
      key: [trackId, vehicle.id, livery.id, settings.laps, settings.difficulty, settings.rivals].join('|')
    });
  }

  function entriesFor(rng) {
    const vehicle = vehicles.find(v => v.id === world.vehicleId);
    const count = demo ? DEMO_RIVALS : world.rivals;
    const pool = vehicles.flatMap(v => v.liveries.map(l => ({ vehicle: v, livery: l.id })))
      .filter(c => !(c.vehicle.id === vehicle.id && c.livery === world.liveryId));
    const picks = shuffle(pool, rng);
    const names = shuffle(rivalNames, rng);
    const [low, high] = world.difficulty.skill;
    const skills = shuffle(Array.from({ length: count }, (_, i) => (count > 1 ? low + (high - low) * (i / (count - 1)) : (low + high) / 2)), rng);
    const rivals = Array.from({ length: count }, (_, i) => {
      const pick = picks[i % picks.length];
      return {
        id: i + 1,
        spec: specs.get(pick.vehicle.id),
        model: pick.vehicle.model,
        livery: pick.livery,
        name: names[i % Math.max(1, names.length)] ?? `Rival ${i + 1}`,
        isPlayer: false,
        skill: skills[i],
        assist: Assist.LIGHT
      };
    }).sort((a, b) => a.skill - b.skill);
    const player = {
      id: 0,
      spec: specs.get(vehicle.id),
      model: vehicle.model,
      livery: world.liveryId,
      name: 'Vos',
      isPlayer: true,
      skill: demo ? (low + high) / 2 : 1,
      assist: ASSISTS[world.difficulty.assist] ?? Assist.LIGHT
    };
    const slot = Math.round(world.difficulty.grid * rivals.length);
    return [...rivals.slice(0, slot), player, ...rivals.slice(slot)];
  }

  function newRace() {
    const rng = createRng();
    return raceFactory({
      track: world.track,
      rules,
      entries: entriesFor(rng),
      laps: world.laps,
      bestLap: bestLapRepository.load(world.recordKey),
      demo
    });
  }

  function notify(event) {
    for (const listener of listeners) listener(event);
  }

  function rebuild() {
    const previous = world;
    world = worldFor(getSettings());
    race = newRace();
    previousCars = race.cars;
    accumulator = 0;
    if (previous.trackId !== world.trackId || previous.vehicleId !== world.vehicleId || previous.liveryId !== world.liveryId) {
      notify({ type: SessionEvent.WORLD_CHANGED, world });
    }
  }

  function apply({ race: next, events, previous }) {
    previousCars = previous ?? next.cars;
    race = next;
    if (demo) return events;
    for (const event of events) {
      if (event.type === RaceEvent.LAP_COMPLETED && event.isBest) bestLapRepository.save(world.recordKey, event.time);
      if (event.type === RaceEvent.COLLISION && event.player && event.intensity > 3 && getSettings().vibration) haptics.pulse(COLLISION_PULSE_MS);
      notify(event);
    }
    return events;
  }

  return {
    get state() { return race; },
    get world() { return world; },
    get isDemo() { return demo; },
    bestLapFor: (trackId, vehicleId) => bestLapRepository.load(bestLapKey(trackId, vehicleId)),

    /** Aplica una selección nueva mientras la carrera espera la largada o corre la demostración. */
    syncSelection() {
      if (!demo && race.status !== RaceStatus.READY) return;
      if (worldFor(getSettings()).key === world.key) return;
      rebuild();
    },

    /** Carrera de autos sin jugador detrás de los menús. */
    startDemo() {
      demo = true;
      rebuild();
    },
    start() {
      if (demo) {
        demo = false;
        rebuild();
      }
      apply(startCountdown(race));
    },
    restart() { demo = false; rebuild(); apply(startCountdown(race)); },
    reset() { demo = false; rebuild(); },
    pause() { apply(pauseRace(race)); },
    resume() { apply(resumeRace(race)); },
    togglePause() {
      apply(race.status === RaceStatus.PAUSED ? resumeRace(race) : pauseRace(race));
    },
    tick(dt, actions) {
      const controls = demo ? NEUTRAL_CONTROLS : toControls(actions, getSettings());
      const h = rules.physicsStep;
      accumulator = Math.min(accumulator + Math.max(0, dt || 0), h * rules.maxSubsteps);
      const steps = Math.floor(accumulator / h + 1e-6);
      let events = [];
      if (steps > 0) {
        events = apply(stepRace(race, controls, steps * h, { track: world.track, rules }));
        accumulator = Math.max(0, accumulator - steps * h);
      }
      const state = interpolateRace(race, previousCars, accumulator / h, world.track);
      return { state, events, controls };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
