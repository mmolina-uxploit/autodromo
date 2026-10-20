/**
 * Calidad gráfica automática. Mira cuánto tardan los cuadros y, si el equipo no sostiene unos
 * 45 cuadros por segundo durante un par de segundos, baja un nivel (primero el resplandor de
 * pantalla, después nubes, halo del sol y destellos). No vuelve a subir sola: un juego que
 * cambia de aspecto a cada rato molesta más que uno un poco más sobrio.
 */
const SLOW = 1 / 45;
const WARMUP = 4;
const PATIENCE = 2;

export function createQualityGovernor({ initial = 2, onChange = () => {} } = {}) {
  let level = initial;
  let average = null;
  let elapsed = 0;
  let slowFor = 0;
  return {
    get level() { return level; },
    /** Un cuadro de `dt` segundos (el ciclo ya descarta pausas largas). */
    sample(dt) {
      if (!(dt > 0) || level === 0) return level;
      elapsed += dt;
      average = average === null ? dt : average + (dt - average) * 0.05;
      if (elapsed < WARMUP) return level;
      slowFor = average > SLOW ? slowFor + dt : 0;
      if (slowFor > PATIENCE) {
        level -= 1;
        slowFor = 0;
        average = null;
        elapsed = WARMUP - 1;
        onChange(level);
      }
      return level;
    }
  };
}
