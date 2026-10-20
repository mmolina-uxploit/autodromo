export function createLapTimer(bestLap = null) {
  return Object.freeze({ lap: 1, current: 0, best: bestLap, last: null });
}

export function tickLapTimer(timer, dt) {
  return Object.freeze({ ...timer, current: timer.current + dt });
}

/** Cierra la vuelta si superó el mínimo. Devuelve el reloj nuevo y la vuelta completada (o null). */
export function completeLap(timer, minLapSeconds) {
  if (timer.current < minLapSeconds) return { timer, completed: null };
  const time = timer.current;
  const isBest = timer.best === null || time < timer.best;
  return {
    timer: Object.freeze({ lap: timer.lap + 1, current: 0, best: isBest ? time : timer.best, last: time }),
    completed: Object.freeze({ lap: timer.lap, time, isBest })
  };
}
