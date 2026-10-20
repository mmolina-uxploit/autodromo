import { h } from '../dom.js';
import { DialogPanel } from './dialog-panel.js';
import { ChoiceGroup } from '../molecules/choice-group.js';
import { StepHeader } from '../molecules/step-header.js';
import { Button } from '../atoms/button.js';
import { Text } from '../atoms/typography.js';

/** Paso 3: vueltas, dificultad y cantidad de rivales, con el resumen antes de largar. */
export function RaceSetup({ settings, laps, difficulties, rivals, onChange, onBack, onStart }) {
  const lapChoice = ChoiceGroup({
    legend: 'Vueltas',
    name: 'vueltas',
    value: String(settings.laps),
    onChange: value => onChange({ laps: Number(value) }),
    options: laps.map(n => ({ value: String(n), label: String(n) }))
  });
  const difficultyChoice = ChoiceGroup({
    legend: 'Dificultad',
    name: 'dificultad',
    value: settings.difficulty,
    onChange: value => onChange({ difficulty: value }),
    options: difficulties.map(d => ({ value: d.id, label: d.name }))
  });
  const rivalChoice = ChoiceGroup({
    legend: 'Rivales',
    name: 'rivales',
    value: String(settings.rivals),
    onChange: value => onChange({ rivals: Number(value) }),
    options: rivals.map(n => ({ value: String(n), label: n === 0 ? 'Contrarreloj' : String(n) }))
  });
  const detail = Text({ tone: 'muted' });
  const summary = h('p', { class: 'o-setup__summary' });
  const start = Button({ label: '¡Largar!', variant: 'primary', icon: 'play', onPress: onStart });

  function setValues(values, describe) {
    lapChoice.set(String(values.laps));
    difficultyChoice.set(values.difficulty);
    rivalChoice.set(String(values.rivals));
    detail.textContent = difficulties.find(d => d.id === values.difficulty)?.tagline ?? '';
    if (describe) summary.textContent = describe(values);
  }

  return {
    el: DialogPanel({
      title: 'Armá la carrera',
      eyebrow: StepHeader({ step: 3, total: 3, label: 'Carrera' }),
      className: 'o-setup',
      body: [lapChoice.el, h('div', { class: 'o-setup__group' }, difficultyChoice.el, detail), rivalChoice.el, summary],
      footer: [Button({ label: 'Volver', icon: 'left', onPress: onBack }), start]
    }),
    initialFocus: start,
    setValues
  };
}
