import { h } from '../dom.js';

/** Radio nativo con aspecto de ficha: conserva flechas, foco y anuncio del lector de pantalla. */
export function RadioChip({ name, value, label, checked = false, swatch }) {
  return h('label', { class: 'a-chip' },
    h('input', { type: 'radio', class: 'a-chip__input', name, value, checked }),
    swatch && h('span', { class: 'a-chip__swatch', style: `--swatch: ${swatch}`, 'aria-hidden': 'true' }),
    h('span', { class: 'a-chip__label', text: label }));
}
