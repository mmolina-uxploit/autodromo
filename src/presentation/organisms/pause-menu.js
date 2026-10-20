import { DialogPanel } from './dialog-panel.js';
import { Button } from '../atoms/button.js';

export function PauseMenu({ onResume, onRestart, onSettings, onHelp, onExit }) {
  const resume = Button({ label: 'Seguir', variant: 'primary', icon: 'play', onPress: onResume });
  return {
    el: DialogPanel({
      title: 'Pausa',
      className: 'o-pause',
      footer: [
        resume,
        Button({ label: 'Reiniciar', icon: 'restart', onPress: onRestart }),
        Button({ label: 'Ajustes', icon: 'sliders', onPress: onSettings }),
        Button({ label: 'Controles', icon: 'help', onPress: onHelp }),
        Button({ label: 'Salir al título', icon: 'home', onPress: onExit })
      ]
    }),
    initialFocus: resume
  };
}
