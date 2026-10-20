import { Action } from '../../application/controls-mapper.js';

export const Command = Object.freeze({ PAUSE: 'pause' });

const BY_KEY = { ArrowLeft: Action.LEFT, ArrowRight: Action.RIGHT, ArrowUp: Action.THROTTLE, ArrowDown: Action.BRAKE };
const BY_CODE = {
  KeyA: Action.LEFT,
  KeyD: Action.RIGHT,
  KeyW: Action.THROTTLE,
  KeyS: Action.BRAKE,
  Space: Action.JUMP,
  KeyJ: Action.JUMP,
  ShiftLeft: Action.BOOST,
  ShiftRight: Action.BOOST,
  KeyK: Action.BOOST
};

/** Flechas por tecla; el resto por posición física, para que funcione en cualquier distribución. */
export const keyToAction = ({ key, code }) => BY_KEY[key] ?? BY_CODE[code] ?? null;

export function keyToCommand({ key, code }) {
  return key === 'Escape' || code === 'KeyP' ? Command.PAUSE : null;
}

export function bindKeyboard(target, { actions, onCommand, isGameActive }) {
  const SOURCE = 'keyboard';

  function onKeyDown(event) {
    if (!isGameActive()) return;
    const action = keyToAction(event);
    if (action) {
      actions.press(action, SOURCE);
      event.preventDefault();
      return;
    }
    const command = keyToCommand(event);
    if (command && !event.repeat) {
      onCommand(command);
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const action = keyToAction(event);
    if (action) actions.release(action, SOURCE);
  }

  const releaseAll = () => actions.releaseSource(SOURCE);

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', releaseAll);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', releaseAll);
  };
}
