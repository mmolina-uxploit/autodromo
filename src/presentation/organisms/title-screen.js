import { h, uniqueId } from '../dom.js';
import { Button } from '../atoms/button.js';

/**
 * Pantalla de título arcade sobre la carrera de demostración.
 * Enter, Espacio o un toque en cualquier lado empiezan; Ajustes y Controles quedan a mano.
 */
export function TitleScreen({ onStart, onSettings, onHelp }) {
  const titleId = uniqueId('titulo');
  const start = Button({ label: 'Empezar', variant: 'primary', icon: 'play', onPress: onStart });
  start.classList.add('o-title__start');
  const record = h('p', { class: 'o-title__record' });
  const el = h('dialog', { class: 'o-title', 'aria-labelledby': titleId },
    h('div', { class: 'o-title__frame' },
      h('p', { class: 'o-title__eyebrow', text: 'Gran Premio de Propulsión' }),
      h('h2', { class: 'o-title__logo', id: titleId },
        h('span', { class: 'o-title__logo-word', text: 'Autódromo' })),
      h('p', { class: 'o-title__tagline', text: 'Cuatro circuitos, cuatro autos con propulsores de aire y rivales que no frenan.' }),
      start,
      h('p', { class: 'o-title__prompt', 'aria-hidden': 'true', text: 'Presioná Enter o tocá la pantalla' }),
      record,
      h('div', { class: 'o-title__extras' },
        Button({ label: 'Ajustes', icon: 'sliders', onPress: onSettings }),
        Button({ label: 'Controles', icon: 'help', onPress: onHelp }))));
  el.addEventListener('click', event => { if (event.target === el) onStart(); });
  return {
    el,
    initialFocus: start,
    setRecord(text) { record.textContent = text; }
  };
}
