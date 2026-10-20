import { createControls } from '../domain/controls.js';

export const Action = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  THROTTLE: 'throttle',
  BRAKE: 'brake',
  JUMP: 'jump',
  BOOST: 'boost'
});

/** Ejes continuos que publica un mando. El teclado y el táctil no los usan. */
export const Axis = Object.freeze({ STEER: 'steer', THROTTLE: 'throttle', BRAKE: 'brake' });

/**
 * Traduce acciones sostenidas en la intención de manejo del cuadro.
 *
 * El eje continuo manda cuando está fuera del reposo: así medio stick es medio giro. En reposo
 * decide el botón, que es lo que deja convivir la cruceta con el stick y el botón de freno con
 * el gatillo. Sin mando no hay ejes y todo sale de los botones, como siempre.
 */
export function toControls(actions, { autoThrottle = false } = {}) {
  const axis = name => actions.axis?.(name) ?? null;
  const pick = (name, digital) => {
    const value = axis(name);
    return value !== null && value !== 0 ? value : digital;
  };

  const steer = pick(Axis.STEER, (actions.has(Action.RIGHT) ? 1 : 0) - (actions.has(Action.LEFT) ? 1 : 0));
  const brake = pick(Axis.BRAKE, actions.has(Action.BRAKE) ? 1 : 0);
  const wantsThrottle = pick(Axis.THROTTLE, actions.has(Action.THROTTLE) || autoThrottle ? 1 : 0);
  return createControls({
    steer,
    brake,
    // El freno recorta el acelerador en proporción a lo pisado: a fondo lo corta entero, como
    // antes, pero un roce de gatillo deja seguir con parte de la fuerza en lugar de cortar todo.
    throttle: wantsThrottle * (1 - brake),
    jump: actions.has(Action.JUMP),
    boost: actions.has(Action.BOOST)
  });
}
