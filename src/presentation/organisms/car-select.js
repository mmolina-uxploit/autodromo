import { h } from '../dom.js';
import { DialogPanel } from './dialog-panel.js';
import { OptionCard } from '../molecules/option-card.js';
import { StatMeters } from '../molecules/stat-meters.js';
import { ChoiceGroup } from '../molecules/choice-group.js';
import { FactList } from '../molecules/fact-list.js';
import { StepHeader } from '../molecules/step-header.js';
import { Picture } from '../atoms/picture.js';
import { Button } from '../atoms/button.js';

/**
 * Paso 1: garaje. Un auto por tarjeta con retrato, ficha técnica y cinco medidores,
 * y el color del auto elegido. `portraitUrl` llega resuelto desde la raíz de composición.
 */
export function CarSelect({ vehicles, settings, portraitUrl, onVehicle, onLivery, onBack, onNext }) {
  const cards = vehicles.map(vehicle => {
    const picture = Picture({ src: portraitUrl(vehicle, vehicle.liveries[0].id), width: 560, height: 300 });
    const card = OptionCard({
      name: 'auto',
      value: vehicle.id,
      checked: vehicle.id === settings.vehicle,
      title: vehicle.name,
      description: vehicle.tagline,
      media: picture,
      extra: [FactList(vehicle.facts), StatMeters(vehicle.stats)]
    });
    return { vehicle, picture, ...card };
  });

  const group = h('fieldset', { class: 'o-car-select__cards' },
    h('legend', { class: 'u-visually-hidden', text: 'Autos disponibles' }),
    cards.map(c => c.el));
  group.addEventListener('change', event => { if (event.target.name === 'auto') onVehicle(event.target.value); });

  const liverySlot = h('div', { class: 'o-car-select__livery' });
  let current = settings;
  let liveryChoice = null;
  let liveryVehicle = null;

  function renderLiveries() {
    const vehicle = vehicles.find(v => v.id === current.vehicle) ?? vehicles[0];
    if (liveryVehicle === vehicle.id) {
      liveryChoice.set(current.livery);
      return;
    }
    liveryVehicle = vehicle.id;
    liveryChoice = ChoiceGroup({
      legend: `Color de ${vehicle.name}`,
      name: 'color-auto',
      value: current.livery,
      onChange: onLivery,
      options: vehicle.liveries.map(l => ({ value: l.id, label: l.name, swatch: l.swatch }))
    });
    liverySlot.replaceChildren(liveryChoice.el);
  }

  function setValues(next) {
    current = next;
    for (const card of cards) {
      const selected = card.vehicle.id === next.vehicle;
      card.input.checked = selected;
      const livery = selected ? next.livery : card.vehicle.liveries[0].id;
      card.picture.src = portraitUrl(card.vehicle, livery);
    }
    renderLiveries();
  }

  const next = Button({ label: 'Siguiente: pista', variant: 'primary', icon: 'right', onPress: onNext });
  const el = DialogPanel({
    title: 'Elegí auto',
    eyebrow: StepHeader({ step: 1, total: 3, label: 'Garaje' }),
    className: 'o-select o-car-select',
    body: [group, liverySlot],
    footer: [Button({ label: 'Volver', icon: 'left', onPress: onBack }), next]
  });
  setValues(settings);

  return {
    el,
    get initialFocus() { return cards.find(c => c.input.checked)?.input ?? next; },
    setValues
  };
}
