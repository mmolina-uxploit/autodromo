import { h } from '../dom.js';

/** Texto que cambia seguido (velocímetro, reloj). Solo toca el DOM si el valor cambió. */
export function Readout({ size = 'm', initial = '' } = {}) {
  const el = h('span', { class: `a-readout a-readout--${size}`, text: initial });
  let current = initial;
  return {
    el,
    set(value) {
      if (value === current) return;
      current = value;
      el.textContent = value;
    }
  };
}
