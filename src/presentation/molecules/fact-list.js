import { h } from '../dom.js';

/** Datos cortos en fila (largo, curvas, desnivel). */
export const FactList = facts => h('ul', { class: 'm-facts' }, facts.map(text => h('li', { class: 'm-facts__item', text })));
