import { h } from '../dom.js';
import { Icon } from './icon.js';

/** Botón táctil de mantener presionado. Fuera del orden de tabulación: el teclado tiene sus propias teclas. */
export function PadButton({ label, icon, action, size = 'regular' }) {
  return h('button', {
    type: 'button',
    class: `a-pad a-pad--${size}`,
    'aria-label': label,
    tabindex: '-1',
    dataset: { action }
  }, icon ? Icon(icon, { size: 40 }) : h('span', { class: 'a-pad__label', 'aria-hidden': 'true', text: label }));
}

export const setPadPressed = (el, pressed) => el.classList.toggle('is-pressed', pressed);
