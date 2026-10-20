import { h } from '../dom.js';

/** Imagen con dimensiones fijas para no mover el diseño al cargar. alt vacío si el texto vecino ya la describe. */
export function Picture({ src, alt = '', width, height, className = 'a-picture' }) {
  return h('img', { class: className, src, alt, width, height, decoding: 'async', draggable: 'false' });
}
