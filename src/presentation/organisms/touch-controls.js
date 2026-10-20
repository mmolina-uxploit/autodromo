import { h } from '../dom.js';
import { PadButton, setPadPressed } from '../atoms/pad-button.js';
import { PadCluster } from '../molecules/pad-cluster.js';
import { Action } from '../../application/controls-mapper.js';

/**
 * Controles táctiles. `bindHold` llega inyectado desde la raíz de composición,
 * así la presentación no depende de los adaptadores de entrada.
 */
export function TouchControls({ bindHold, onAction }) {
  const left = PadButton({ label: 'Izquierda', icon: 'left', action: Action.LEFT });
  const right = PadButton({ label: 'Derecha', icon: 'right', action: Action.RIGHT });
  const brake = PadButton({ label: 'Freno', action: Action.BRAKE });
  const gas = PadButton({ label: 'Acelerar', action: Action.THROTTLE, size: 'large' });
  const jump = PadButton({ label: 'Salto', action: Action.JUMP, size: 'small' });
  const boost = PadButton({ label: 'Empuje', action: Action.BOOST, size: 'small' });
  jump.classList.add('a-pad--thrust');
  boost.classList.add('a-pad--thrust');

  for (const pad of [left, right, brake, gas, jump, boost]) {
    bindHold(pad, {
      onPress: () => { setPadPressed(pad, true); onAction(pad.dataset.action, true); },
      onRelease: () => { setPadPressed(pad, false); onAction(pad.dataset.action, false); }
    });
  }

  const el = h('div', { class: 'o-touch' },
    PadCluster({ label: 'Dirección', pads: [left, right] }),
    h('div', { class: 'o-touch__right' },
      PadCluster({ label: 'Propulsores', pads: [jump, boost] }),
      PadCluster({ label: 'Pedales', pads: [brake, gas] })));

  return {
    el,
    setSwapped(value) { el.classList.toggle('o-touch--swapped', value); },
    setAutoThrottle(value) {
      gas.hidden = value;
      brake.classList.toggle('a-pad--large', value);
    }
  };
}
