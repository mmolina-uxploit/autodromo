import { RaceEvent, playerOf } from '../domain/race.js';

export function formatLapTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const centis = Math.round(seconds * 100);
  const minutes = Math.floor(centis / 6000);
  const rest = (centis - minutes * 6000) / 100;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

export const toKmh = speed => Math.round(Math.abs(speed) * 3.6);
export const ordinal = n => `${n}º`;
const clamp01 = v => Math.min(1, Math.max(0, v));
const clampUnit = v => Math.min(1, Math.max(-1, v));

/** Compresión de cada resorte (delantero izq., der., trasero izq., der.) en -1..1 del recorrido. */
export function suspensionCompression(car, spec) {
  const { heave, pitch, roll } = car.susp;
  const t = spec.suspension.travel;
  const half = spec.width * 0.42;
  const front = -heave - pitch * spec.a;
  const rear = -heave + pitch * spec.b;
  return [front - roll * half, front + roll * half, rear - roll * half, rear + roll * half].map(c => clampUnit(c / t));
}

/** Modelo del tablero para el jugador: textos listos y fracciones 0..1 para medidores. */
export function presentHud(race) {
  const player = playerOf(race);
  const spec = race.specs[player.specId];
  const total = race.cars.length;
  const laps = Number.isFinite(race.laps) ? race.laps : null;
  return {
    speed: String(toKmh(player.u)),
    gear: player.reversing ? 'R' : spec.electric ? 'E' : String(player.gear),
    rpm: clamp01(player.rpm / spec.redline),
    position: ordinal(race.position),
    positionText: `${ordinal(race.position)} de ${total}`,
    total: String(total),
    lap: laps ? `Vuelta ${race.timer.lap}/${laps}` : 'Demostración',
    time: formatLapTime(race.timer.current),
    best: formatLapTime(race.timer.best) ?? 'sin registro',
    energy: clamp01(player.energy),
    lifting: player.lifting,
    boosting: player.boosting,
    airborne: player.airborne,
    suspension: suspensionCompression(player, spec)
  };
}

/** Texto breve para la región en vivo; null si el evento no se anuncia. */
export function describeEvent(event) {
  switch (event.type) {
    case RaceEvent.COUNTDOWN_TICK: return String(event.value);
    case RaceEvent.STARTED: return 'Largada';
    case RaceEvent.LAP_COMPLETED:
      return `Vuelta ${event.lap} en ${formatLapTime(event.time)}.${event.isBest ? ' Mejor vuelta.' : ''}`;
    case RaceEvent.FINAL_LAP: return 'Última vuelta';
    case RaceEvent.POSITION_CHANGED: return `Vas ${ordinal(event.position)} de ${event.total}`;
    case RaceEvent.COLLISION: return event.player && event.intensity > 3 ? 'Choque' : null;
    case RaceEvent.FELL: return event.player ? 'Caíste al foso' : null;
    case RaceEvent.FINISHED: return event.player ? `Llegaste en ${formatLapTime(event.time)}` : null;
    case RaceEvent.RACE_OVER: {
      const mine = event.results.find(r => r.isPlayer);
      return mine ? `Carrera terminada. Puesto ${ordinal(mine.position)} de ${event.results.length}.` : 'Carrera terminada';
    }
    case RaceEvent.PAUSED: return 'Pausa';
    case RaceEvent.RESUMED: return 'Carrera reanudada';
    default: return null;
  }
}
