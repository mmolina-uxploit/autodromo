import { h } from '../dom.js';

/** Barra segmentada de 1 a `max`. Expone valor y texto con role="meter". */
export function Meter({ label, value, max = 5, text = `${value} de ${max}` }) {
  return h('span', {
    class: 'a-meter',
    role: 'meter',
    'aria-label': label,
    'aria-valuemin': 1,
    'aria-valuemax': max,
    'aria-valuenow': value,
    'aria-valuetext': text
  }, Array.from({ length: max }, (_, i) =>
    h('span', { class: `a-meter__cell${i < value ? ' is-on' : ''}`, 'aria-hidden': 'true' })));
}
