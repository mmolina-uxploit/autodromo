import { h, uniqueId } from '../dom.js';

/**
 * Tarjeta seleccionable: un radio nativo cubre toda la tarjeta.
 * El nombre accesible sale del título y la descripción del resto, para no leer la tarjeta entera.
 */
export function OptionCard({ name, value, checked = false, title, media, description, extra = [] }) {
  const id = uniqueId('opcion');
  const input = h('input', {
    type: 'radio',
    class: 'm-option-card__input',
    name,
    value,
    checked,
    'aria-labelledby': `${id}-titulo`,
    'aria-describedby': `${id}-desc`
  });
  const el = h('label', { class: 'm-option-card' },
    input,
    media && h('span', { class: 'm-option-card__media' }, media),
    h('span', { class: 'm-option-card__body' },
      h('span', { class: 'm-option-card__title', id: `${id}-titulo`, text: title }),
      h('span', { class: 'm-option-card__description', id: `${id}-desc`, text: description }),
      extra),
    h('span', { class: 'm-option-card__check', 'aria-hidden': 'true' }));
  return { el, input };
}
