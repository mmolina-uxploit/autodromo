import { h } from '../dom.js';
import { DialogPanel } from './dialog-panel.js';
import { KeyList } from '../molecules/key-list.js';
import { Button } from '../atoms/button.js';
import { Heading, Text } from '../atoms/typography.js';

export function HelpPanel({ onDone }) {
  const back = Button({ label: 'Volver', variant: 'primary', onPress: onDone });
  return {
    el: DialogPanel({
      title: 'Controles',
      className: 'o-help',
      body: [
        h('section', { class: 'o-help__section' },
          Heading({ level: 3, text: 'Teclado' }),
          KeyList([
            { keys: ['←', '→'], description: 'Dirigir. También A y D.' },
            { keys: ['↑'], description: 'Acelerar. También W.' },
            { keys: ['↓'], description: 'Frenar; detenido, marcha atrás. También S.' },
            { keys: ['Espacio'], description: 'Propulsor de salto: un toque despega, sostenido planea. También J.' },
            { keys: ['Shift'], description: 'Propulsor de empuje. También K.' },
            { keys: ['Esc', 'P'], description: 'Pausar y abrir el menú.' }
          ])),
        h('section', { class: 'o-help__section' },
          Heading({ level: 3, text: 'Mando' }),
          Text({ text: 'Stick o cruceta para dirigir, gatillo derecho acelera, gatillo izquierdo frena, A salta, X o RB empuja, Start pausa. El stick y los gatillos valen por recorrido: medio stick es medio giro. En los menús la cruceta mueve el foco y A confirma.' })),
        h('section', { class: 'o-help__section' },
          Heading({ level: 3, text: 'Pantalla táctil' }),
          Text({ text: 'Dirección abajo a la izquierda; freno y acelerador abajo a la derecha, con Salto y Empuje encima. Podés usar varios dedos a la vez e invertir los lados en Ajustes.' })),
        h('section', { class: 'o-help__section' },
          Heading({ level: 3, text: 'Propulsores' }),
          Text({ text: 'La barra de propulsores se recarga sola mientras las ruedas tocan el piso. Si llegás lento a una rampa, saltá en el labio y sostené para planear sobre el foso. El empuje también sirve en el aire.' }))
      ],
      footer: [back]
    }),
    initialFocus: back
  };
}
