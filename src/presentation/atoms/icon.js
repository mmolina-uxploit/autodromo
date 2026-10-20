import { svg } from '../dom.js';

const ICONS = {
  left: { d: 'M15 5 8 12l7 7' },
  right: { d: 'M9 5l7 7-7 7' },
  pause: { d: 'M8.5 5v14M15.5 5v14' },
  play: { d: 'M8 5.5v13l10-6.5z', fill: true },
  restart: { d: 'M5 12a7 7 0 1 0 2.1-5M5 4.5V9h4.5' },
  sliders: { d: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5' },
  help: { d: 'M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8M12 17.2v.1' },
  home: { d: 'M4 11.5 12 4.5l8 7M6.5 10v9.5h11V10' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' }
};

export function Icon(name, { size = 24 } = {}) {
  const icon = ICONS[name];
  return svg('svg', { class: 'a-icon', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', {
      d: icon.d,
      fill: icon.fill ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': 2.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }));
}
