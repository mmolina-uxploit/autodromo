import { h, uniqueId } from '../dom.js';
import { Switch } from '../atoms/switch.js';

export function SettingRow({ label, description, checked, onChange }) {
  const id = uniqueId('ajuste');
  const control = Switch({
    id,
    labelledBy: `${id}-label`,
    describedBy: description ? `${id}-desc` : undefined,
    checked,
    onChange
  });
  const title = h('span', { id: `${id}-label`, class: 'm-setting__label', text: label });
  title.addEventListener('click', () => control.el.click());
  return {
    el: h('div', { class: 'm-setting' },
      h('div', { class: 'm-setting__text' },
        title,
        description && h('span', { id: `${id}-desc`, class: 'm-setting__description', text: description })),
      control.el),
    set: control.set
  };
}
