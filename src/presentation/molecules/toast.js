import { h } from '../dom.js';

/** Aviso visual breve. Oculto para lectores de pantalla: la región en vivo ya anuncia lo mismo. */
export function Toast() {
  const el = h('div', { class: 'm-toast', 'aria-hidden': 'true' });
  let timer = 0;
  return {
    el,
    show(text, ms = 2200) {
      el.textContent = text;
      el.classList.add('is-visible');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-visible'), ms);
    }
  };
}
