import { h } from '../dom.js';

/** Interruptor accesible: role="switch" con aria-checked; el estado se ve por posición, no solo por color. */
export function Switch({ id, labelledBy, describedBy, checked = false, onChange }) {
  const el = h('button', {
    type: 'button',
    role: 'switch',
    id,
    class: 'a-switch',
    'aria-checked': String(checked),
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy
  }, h('span', { class: 'a-switch__thumb', 'aria-hidden': 'true' }));

  const set = value => el.setAttribute('aria-checked', String(value));
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    set(next);
    onChange?.(next);
  });
  return { el, set };
}
