import { h } from '../dom.js';
import { Meter } from '../atoms/meter.js';

export const StatMeters = stats => h('div', { class: 'm-stat-meters' },
  stats.map(stat => h('div', { class: 'm-stat-meters__row' },
    h('span', { class: 'm-stat-meters__label', 'aria-hidden': 'true', text: stat.label }),
    Meter({ label: stat.label, value: stat.value, text: stat.text }))));
