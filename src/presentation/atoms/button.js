import { h } from '../dom.js';
import { Icon } from './icon.js';

/** Variantes: primary (acción principal), secondary, plate (sobre la pista). */
export function Button({ label, variant = 'secondary', icon, iconOnly = false, onPress, ...attrs }) {
  return h('button', {
    type: 'button',
    class: `a-button a-button--${variant}${iconOnly ? ' a-button--icon' : ''}`,
    'aria-label': iconOnly ? label : undefined,
    onClick: onPress,
    ...attrs
  },
  icon && Icon(icon),
  !iconOnly && h('span', { class: 'a-button__label', text: label }));
}
