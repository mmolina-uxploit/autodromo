import { h } from '../dom.js';
import { RadioChip } from '../atoms/radio-chip.js';

/** Grupo de opciones excluyentes con leyenda: fieldset + radios nativos. */
export function ChoiceGroup({ legend, name, options, value, onChange }) {
  const el = h('fieldset', { class: 'm-choice' },
    h('legend', { class: 'm-choice__legend', text: legend }),
    h('div', { class: 'm-choice__options' },
      options.map(option => RadioChip({ name, ...option, checked: option.value === value }))));

  el.addEventListener('change', event => {
    if (event.target.name === name) onChange(event.target.value);
  });

  return {
    el,
    set(next) {
      for (const input of el.querySelectorAll('input')) input.checked = input.value === next;
    }
  };
}
