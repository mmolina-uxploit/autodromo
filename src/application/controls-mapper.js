import { createControls } from '../domain/controls.js';

export const Action = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  THROTTLE: 'throttle',
  BRAKE: 'brake',
  JUMP: 'jump',
  BOOST: 'boost'
});

/** Traduce acciones sostenidas en la intención de manejo del cuadro. */
export function toControls(actions, { autoThrottle = false } = {}) {
  const steer = (actions.has(Action.RIGHT) ? 1 : 0) - (actions.has(Action.LEFT) ? 1 : 0);
  const brake = actions.has(Action.BRAKE) ? 1 : 0;
  const wantsThrottle = actions.has(Action.THROTTLE) || autoThrottle;
  return createControls({
    steer,
    brake,
    throttle: brake ? 0 : Number(wantsThrottle),
    jump: actions.has(Action.JUMP),
    boost: actions.has(Action.BOOST)
  });
}
