import { h } from '../dom.js';

/** Región en vivo invisible: anuncia eventos al lector de pantalla sin interrumpir. */
export function LiveRegion() {
  const el = h('div', { class: 'u-visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let timer = 0;
  return {
    el,
    announce(text) {
      clearTimeout(timer);
      el.textContent = '';
      timer = setTimeout(() => { el.textContent = text; }, 60);
    }
  };
}
