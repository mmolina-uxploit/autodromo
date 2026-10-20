import { h } from '../dom.js';
import { DialogPanel } from './dialog-panel.js';
import { OptionCard } from '../molecules/option-card.js';
import { FactList } from '../molecules/fact-list.js';
import { StepHeader } from '../molecules/step-header.js';
import { ProfileGraphic } from '../atoms/profile-graphic.js';
import { TrackMap } from '../atoms/track-map.js';
import { Button } from '../atoms/button.js';

/** Plano y perfil de altura de una pista, sobre el cielo de su zona. */
export const trackVisual = track => h('span', { class: 'o-track-visual' },
  TrackMap({ map: track.info.map, aspect: track.info.aspect, jumpMarks: track.info.jumpMarks, accent: track.zone.accent }),
  ProfileGraphic({
    profile: track.info.profile,
    bends: track.info.bends,
    sky: track.zone.sky,
    ground: track.zone.road.ground[0],
    accent: track.zone.accent
  }));

/** Paso 2: pista. Plano real, perfil de altura, datos clave y mejor vuelta con el auto elegido. */
export function TrackSelect({ tracks, settings, onTrack, onBack, onNext }) {
  const cards = tracks.map(track => {
    const best = h('span', { class: 'o-track-select__best' });
    const card = OptionCard({
      name: 'pista',
      value: track.id,
      checked: track.id === settings.track,
      title: track.name,
      description: track.tagline,
      media: trackVisual(track),
      extra: [
        FactList([
          track.info.length,
          `${track.info.curves} curvas`,
          `${track.info.jumps} ${track.info.jumps === 1 ? 'salto' : 'saltos'}`,
          `Desnivel ${track.info.elevation}`,
          track.zone.time === 'noche' ? 'De noche' : 'De día'
        ]),
        best
      ]
    });
    return { track, best, ...card };
  });

  const group = h('fieldset', { class: 'o-track-select__cards' },
    h('legend', { class: 'u-visually-hidden', text: 'Pistas disponibles' }),
    cards.map(c => c.el));
  group.addEventListener('change', event => { if (event.target.name === 'pista') onTrack(event.target.value); });

  const next = Button({ label: 'Siguiente: carrera', variant: 'primary', icon: 'right', onPress: onNext });

  return {
    el: DialogPanel({
      title: 'Elegí pista',
      eyebrow: StepHeader({ step: 2, total: 3, label: 'Circuito' }),
      className: 'o-select o-track-select',
      body: [group],
      footer: [Button({ label: 'Volver', icon: 'left', onPress: onBack }), next]
    }),
    get initialFocus() { return cards.find(c => c.input.checked)?.input ?? next; },
    setValues(values) { for (const card of cards) card.input.checked = card.track.id === values.track; },
    /** bestText(trackId) → texto de la mejor vuelta con el auto elegido. */
    setBestLaps(bestText) { for (const card of cards) card.best.textContent = bestText(card.track.id); }
  };
}
