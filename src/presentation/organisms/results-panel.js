import { h } from '../dom.js';
import { DialogPanel } from './dialog-panel.js';
import { Button } from '../atoms/button.js';
import { Text } from '../atoms/typography.js';

/**
 * Resultados: tabla de llegada con tiempos y mejor vuelta. Las filas llegan ya formateadas
 * desde la página: { position, name, car, time, best, isPlayer, finished }.
 */
export function ResultsPanel({ onRematch, onChange, onMenu }) {
  const headline = Text({});
  const body = h('tbody');
  const table = h('div', { class: 'o-results__scroll' },
    h('table', { class: 'o-results__table' },
      h('caption', { class: 'u-visually-hidden', text: 'Orden de llegada' }),
      h('thead', {}, h('tr', {},
        ['Puesto', 'Piloto', 'Auto', 'Tiempo', 'Mejor vuelta'].map(t => h('th', { scope: 'col', text: t })))),
      body));
  const rematch = Button({ label: 'Revancha', variant: 'primary', icon: 'restart', onPress: onRematch });
  const el = DialogPanel({
    title: 'Resultados',
    className: 'o-results',
    body: [headline, table],
    footer: [rematch, Button({ label: 'Cambiar auto o pista', icon: 'sliders', onPress: onChange }), Button({ label: 'Menú', icon: 'home', onPress: onMenu })]
  });

  return {
    el,
    initialFocus: rematch,
    show({ title, rows }) {
      headline.textContent = title;
      body.replaceChildren(...rows.map(row => h('tr', { class: row.isPlayer ? 'is-player' : undefined },
        h('td', { class: 'o-results__pos', text: row.position }),
        h('th', { scope: 'row', text: row.name }),
        h('td', { text: row.car }),
        h('td', { class: 'o-results__num', text: row.time }),
        h('td', { class: 'o-results__num', text: row.best }))));
    }
  };
}
