import { h } from '../dom.js';

/** Esqueleto de la pantalla de carrera: escenario, tablero, superposiciones, controles y diálogos. */
export function RaceLayout({ canvas }) {
  canvas.classList.add('t-race__canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const stage = h('div', { class: 't-race__stage', tabindex: '-1', role: 'group', 'aria-label': 'Pista de carrera' }, canvas);
  const slots = {
    hud: h('div', { class: 't-race__hud' }),
    overlay: h('div', { class: 't-race__overlay' }),
    controls: h('div', { class: 't-race__controls' }),
    live: h('div'),
    dialogs: h('div')
  };
  const el = h('main', { class: 't-race' },
    h('h1', { class: 'u-visually-hidden', text: 'Autódromo' }),
    stage, slots.hud, slots.overlay, slots.controls, slots.live, slots.dialogs);
  return { el, stage, slots };
}
