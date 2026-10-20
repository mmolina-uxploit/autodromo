import { Action, Axis } from '../../application/controls-mapper.js';

/**
 * Mando estándar (Gamepad API), leído en cada cuadro.
 * Carrera: stick o cruceta para dirigir, RT acelera, LT o B frena, A salta, X o RB empuja, Start pausa.
 * Menús: cruceta arriba/abajo mueve el foco, izquierda/derecha cambia la opción, A confirma, B vuelve.
 */
export const GAMEPAD_MAP = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15
});

const DEAD_ZONE = 0.35;
// Reposo de los ejes continuos: lo justo para descartar el ruido del sensor, mucho menos que
// el umbral de botón, que existe para que el stick no dispare acciones de menú sin querer.
const STICK_REST = 0.08;
const TRIGGER_REST = 0.05;
// El apoyo lateral se satura cerca de medio recorrido del stick, así que un exponente mayor que
// uno estira la zona central y reparte el control fino sobre más camino del pulgar.
const STICK_CURVE = 1.45;

/** Recorrido útil de un eje: descuenta el reposo, reescala a [0, 1] y le aplica la curva. */
function travel(raw, rest, curve = 1) {
  const size = Math.abs(raw);
  if (!(size > rest)) return 0;
  return Math.sign(raw) * Math.min(1, Math.pow((size - rest) / (1 - rest), curve));
}

/**
 * Recorrido continuo del stick y los gatillos. Un mando que solo dé botones devuelve 0 en los
 * tres ejes, y entonces manda la señal de botón.
 */
export function gamepadAxes(pad) {
  if (!pad) return null;
  const x = pad.axes?.[0];
  const trigger = i => {
    const b = pad.buttons?.[i];
    if (typeof b?.value === 'number') return b.value;
    return b?.pressed ? 1 : 0;
  };
  return {
    [Axis.STEER]: typeof x === 'number' ? travel(x, STICK_REST, STICK_CURVE) : 0,
    [Axis.THROTTLE]: travel(trigger(GAMEPAD_MAP.RT), TRIGGER_REST),
    [Axis.BRAKE]: travel(trigger(GAMEPAD_MAP.LT), TRIGGER_REST)
  };
}

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

  // Los ejes se sueltan aunque no hubiera ningún botón apretado: un stick a medias no enciende
  // ninguna acción, así que mirar solo los botones lo dejaría publicado para siempre.
  let axesLive = false;
  function standDown() {
    if (previous.size) { actions.releaseSource(SOURCE); previous = new Set(); }
    else if (axesLive) actions.releaseSource(SOURCE);
    axesLive = false;
  }

  return {
    poll() {
      const pad = [...getPads()].find(p => p && p.connected);
      const pressed = edges(pad);
      if (!pad) {
        standDown();
        return;
      }
      if (!isGameActive()) {
        standDown();
        for (const [name, index] of Object.entries(GAMEPAD_MAP)) if (pressed[index]) onMenu?.(name);
        return;
      }
      if (pressed[GAMEPAD_MAP.START]) onPause?.();
      const held = gamepadActions(pad);
      for (const action of held) if (!previous.has(action)) actions.press(action, SOURCE);
      for (const action of previous) if (!held.has(action)) actions.release(action, SOURCE);
      previous = held;
      const axes = gamepadAxes(pad);
      for (const [name, value] of Object.entries(axes)) actions.setAxis?.(name, value, SOURCE);
      axesLive = true;
    }
  };
}
