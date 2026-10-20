import { h, uniqueId } from '../dom.js';
import { Heading } from '../atoms/typography.js';

/** Panel modal sobre <dialog>: foco contenido, fondo inerte y Escape nativos del navegador. */
export function DialogPanel({ title, className = '', eyebrow = null, body = [], footer = [] }) {
  const titleId = uniqueId('dialogo');
  return h('dialog', { class: `o-dialog ${className}`.trim(), 'aria-labelledby': titleId },
    h('div', { class: 'o-dialog__body' }, eyebrow, Heading({ level: 2, text: title, id: titleId, className: 'o-dialog__title' }), body),
    footer.length ? h('div', { class: 'o-dialog__footer' }, footer) : null);
}
