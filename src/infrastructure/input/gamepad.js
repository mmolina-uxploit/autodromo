import { Action } from '../../application/controls-mapper.js';

/**
 * Mando estándar (Gamepad API), leído en cada cuadro.
 * Carrera: stick o cruceta para dirigir, RT acelera, LT o B frena, A salta, X o RB empuja, Start pausa.
 * Menús: cruceta arriba/abajo mueve el foco, izquierda/derecha cambia la opción, A confirma, B vuelve.
 */
export const GAMEPAD_MAP = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15
});

const DEAD_ZONE = 0.35;

/** Acciones sostenidas que pide el mando en este instante. Puro: sirve para probarlo sin navegador. */
export function gamepadActions(pad) {
  const held = new Set();
  if (!pad) return held;
  const button = i => {
    const b = pad.buttons?.[i];
    return Boolean(b && (b.pressed || b.value > 0.25));
  };
  const x = pad.axes?.[0] ?? 0;
  if (x < -DEAD_ZONE || button(GAMEPAD_MAP.LEFT)) held.add(Action.LEFT);
  if (x > DEAD_ZONE || button(GAMEPAD_MAP.RIGHT)) held.add(Action.RIGHT);
  if (button(GAMEPAD_MAP.RT) || button(GAMEPAD_MAP.UP)) held.add(Action.THROTTLE);
  if (button(GAMEPAD_MAP.LT) || button(GAMEPAD_MAP.B) || button(GAMEPAD_MAP.DOWN)) held.add(Action.BRAKE);
  if (button(GAMEPAD_MAP.A)) held.add(Action.JUMP);
  if (button(GAMEPAD_MAP.X) || button(GAMEPAD_MAP.RB)) held.add(Action.BOOST);
  return held;
}

export function createGamepadInput({ actions, isGameActive, onPause, onMenu, getPads = () => globalThis.navigator?.getGamepads?.() ?? [] }) {
  const SOURCE = 'gamepad';
  let previous = new Set();
  let previousButtons = [];

  function edges(pad) {
    const now = (pad?.buttons ?? []).map(b => Boolean(b?.pressed));
    const pressed = now.map((v, i) => v && !previousButtons[i]);
    previousButtons = now;
    return pressed;
  }

  return {
    poll() {
      const pad = [...getPads()].find(p => p && p.connected);
      const pressed = edges(pad);
      if (!pad) {
        if (previous.size) { actions.releaseSource(SOURCE); previous = new Set(); }
        return;
      }
      if (!isGameActive()) {
        if (previous.size) { actions.releaseSource(SOURCE); previous = new Set(); }
        for (const [name, index] of Object.entries(GAMEPAD_MAP)) if (pressed[index]) onMenu?.(name);
        return;
      }
      if (pressed[GAMEPAD_MAP.START]) onPause?.();
      const held = gamepadActions(pad);
      for (const action of held) if (!previous.has(action)) actions.press(action, SOURCE);
      for (const action of previous) if (!held.has(action)) actions.release(action, SOURCE);
      previous = held;
    }
  };
}
