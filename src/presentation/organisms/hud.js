import { h } from '../dom.js';
import { Readout } from '../atoms/readout.js';
import { Button } from '../atoms/button.js';

const WHEELS = ['Delantera izquierda', 'Delantera derecha', 'Trasera izquierda', 'Trasera derecha'];

/** Escribe una variable CSS solo si cambió lo suficiente: el tablero se actualiza en cada cuadro. */
function cssVar(el, name, digits = 2) {
  let last = null;
  return value => {
    const text = value.toFixed(digits);
    if (text === last) return;
    last = text;
    el.style.setProperty(name, text);
  };
}

/**
 * Tablero de carrera: puesto y vueltas arriba a la izquierda, velocímetro con marcha,
 * régimen y energía de propulsores abajo a la derecha, telemetría de suspensión abajo
 * a la izquierda. El minimapa lo dibuja el canvas.
 */
export function Hud({ onPause }) {
  const position = Readout({ size: 'xl', initial: '1º' });
  const total = Readout({ size: 'caption', initial: 'de 1' });
  const lap = Readout({ size: 'm', initial: 'Vuelta 1' });
  const time = Readout({ size: 'm', initial: '0:00.00' });
  const best = Readout({ size: 'caption', initial: 'Mejor: sin registro' });
  const speed = Readout({ size: 'xl', initial: '0' });
  const gear = Readout({ size: 'm', initial: '1' });
  const pause = Button({
    label: 'Pausa', icon: 'pause', iconOnly: true, variant: 'plate',
    onPress: onPause, 'aria-keyshortcuts': 'Escape P'
  });

  const rpm = h('span', { class: 'o-hud__bar o-hud__bar--rpm', 'aria-hidden': 'true' }, h('span', { class: 'o-hud__fill' }));
  const energy = h('span', { class: 'o-hud__bar o-hud__bar--energy', 'aria-hidden': 'true' }, h('span', { class: 'o-hud__fill' }));
  const dash = h('div', { class: 'o-hud__plate o-hud__dash' },
    h('div', { class: 'o-hud__speed' }, speed.el, h('span', { class: 'o-hud__unit', text: 'km/h' })),
    h('div', { class: 'o-hud__gear' }, h('span', { class: 'o-hud__label', text: 'Marcha' }), gear.el),
    h('div', { class: 'o-hud__meter' }, h('span', { class: 'o-hud__label', text: 'Régimen' }), rpm),
    h('div', { class: 'o-hud__meter' }, h('span', { class: 'o-hud__label', text: 'Propulsores' }), energy));

  const springs = WHEELS.map(name => h('span', { class: 'o-hud__spring', title: name }, h('span', { class: 'o-hud__coil' })));
  const telemetry = h('div', { class: 'o-hud__plate o-hud__telemetry', 'aria-hidden': 'true' },
    h('span', { class: 'o-hud__label', text: 'Suspensión' }),
    h('div', { class: 'o-hud__chassis' }, springs));

  const el = h('section', { class: 'o-hud', 'aria-label': 'Tablero de carrera' },
    h('div', { class: 'o-hud__top' },
      h('div', { class: 'o-hud__plate o-hud__race' },
        h('div', { class: 'o-hud__position' }, position.el, total.el),
        h('div', { class: 'o-hud__times' }, lap.el, time.el, best.el)),
      pause),
    h('div', { class: 'o-hud__bottom' }, telemetry, dash));

  const setRpm = cssVar(rpm, '--v');
  const setEnergy = cssVar(energy, '--v');
  const setSprings = springs.map(s => cssVar(s, '--c'));

  return {
    el,
    update(model) {
      position.set(model.position);
      total.set(`de ${model.total}`);
      lap.set(model.lap);
      time.set(model.time);
      best.set(`Mejor: ${model.best}`);
      speed.set(model.speed);
      gear.set(model.gear);
      setRpm(model.rpm);
      setEnergy(model.energy);
      model.suspension.forEach((c, i) => setSprings[i](c));
      dash.classList.toggle('is-boost', model.boosting || model.lifting);
      dash.classList.toggle('is-low', model.energy < 0.2);
      telemetry.classList.toggle('is-air', model.airborne);
    }
  };
}
