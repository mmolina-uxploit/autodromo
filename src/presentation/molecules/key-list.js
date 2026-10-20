import { h } from '../dom.js';
import { Kbd } from '../atoms/typography.js';

/** Lista de atajos: cada fila es un grupo de teclas y lo que hacen. */
export const KeyList = rows => h('dl', { class: 'm-key-list' },
  rows.flatMap(({ keys, description }) => [
    h('dt', { class: 'm-key-list__keys' }, keys.map(Kbd)),
    h('dd', { class: 'm-key-list__description', text: description })
  ]));
