import { h } from '../dom.js';

export function Countdown() {
  const el = h('div', { class: 'm-countdown', 'aria-hidden': 'true' });
  let timer = 0;
  const hide = () => el.classList.remove('is-visible');
  return {
    el,
    hide,
    show(text, ms = 0) {
      clearTimeout(timer);
      el.textContent = text;
      el.classList.remove('is-visible');
      void el.offsetWidth;
      el.classList.add('is-visible');
      if (ms) timer = setTimeout(hide, ms);
    }
  };
}
