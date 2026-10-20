import { DialogPanel } from './dialog-panel.js';
import { SettingRow } from '../molecules/setting-row.js';
import { Button } from '../atoms/button.js';

const ROWS = [
  { key: 'sound', label: 'Efectos de sonido', description: 'Motor, neumáticos, propulsores y choques.' },
  { key: 'music', label: 'Música', description: 'Pista sintetizada en los menús y en carrera.' },
  { key: 'autoThrottle', label: 'Aceleración automática', description: 'El auto acelera solo: vos dirigís y frenás. Permite jugar con una mano.' },
  { key: 'swapControls', label: 'Invertir controles táctiles', description: 'Pedales y propulsores a la izquierda, dirección a la derecha.' },
  { key: 'vibration', label: 'Vibrar al chocar', description: 'Solo en dispositivos que lo admiten.' },
  { key: 'reducedMotion', label: 'Reducir movimiento', description: 'Quita sacudidas de cámara, líneas de velocidad y animaciones.' }
];

export function SettingsPanel({ settings, onChange, onDone }) {
  const rows = ROWS.map(row => ({
    ...row,
    control: SettingRow({ label: row.label, description: row.description, checked: settings[row.key], onChange: value => onChange({ [row.key]: value }) })
  }));
  const done = Button({ label: 'Listo', variant: 'primary', icon: 'check', onPress: onDone });
  return {
    el: DialogPanel({ title: 'Ajustes', className: 'o-settings', body: rows.map(r => r.control.el), footer: [done] }),
    initialFocus: rows[0].control.el.querySelector('[role="switch"]'),
    setValues(s) { for (const row of rows) row.control.set(s[row.key]); }
  };
}
