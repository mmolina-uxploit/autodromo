/**
 * Ciclo de cuadros con paso acotado para que una pestaña lenta no teletransporte al auto.
 * Las marcas de tiempo del navegador traen ruido de algunas décimas de milisegundo: se estima
 * el período de la pantalla y, si el cuadro duró lo esperado, se usa ese período exacto. Un
 * cuadro perdido conserva su duración real.
 */
export function createGameLoop({
  onFrame,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  maxStep = 0.05
}) {
  let handle = null;
  let last = null;
  let period = null;

  function steady(raw) {
    if (period === null) period = raw;
    else if (raw > period * 0.6 && raw < period * 1.4) period += (raw - period) * 0.05;
    else if (raw < period * 0.6) period = raw;
    return Math.abs(raw - period) < period * 0.12 ? period : raw;
  }

  function frame(now) {
    const raw = last === null ? 0 : (now - last) / 1000;
    const dt = raw > 0 ? Math.min(maxStep, steady(raw)) : 0;
    last = now;
    handle = requestFrame(frame);
    onFrame(dt);
  }

  return {
    start() {
      if (handle !== null) return;
      last = null;
      handle = requestFrame(frame);
    },
    stop() {
      if (handle === null) return;
      cancelFrame(handle);
      handle = null;
    },
    get running() { return handle !== null; }
  };
}
