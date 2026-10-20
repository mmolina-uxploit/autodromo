import { svg } from '../dom.js';

const SIZE = 100;
const PAD = 8;

/**
 * Plano del circuito desde arriba: el trazado real, la largada y los saltos.
 * Decorativo: el largo, las curvas y los saltos se informan en texto al lado.
 */
export function TrackMap({ map, aspect, jumpMarks = [], accent }) {
  const inner = SIZE - PAD * 2;
  const offX = PAD + (inner - aspect[0] * inner) / 2;
  const offY = PAD + (inner - aspect[1] * inner) / 2;
  const pt = ([x, y]) => [offX + x * inner, offY + y * inner];
  const d = `${map.map((p, i) => `${i ? 'L' : 'M'}${pt(p).map(v => v.toFixed(1)).join(',')}`).join('')}Z`;
  const [sx, sy] = pt(map[0]);
  return svg('svg', { class: 'a-track-map', viewBox: `0 0 ${SIZE} ${SIZE}`, 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d, fill: 'none', stroke: '#1c1f3a', 'stroke-width': 7, 'stroke-linejoin': 'round' }),
    svg('path', { d, fill: 'none', stroke: '#efebe4', 'stroke-width': 3.2, 'stroke-linejoin': 'round' }),
    svg('path', { d, fill: 'none', stroke: accent, 'stroke-width': 1.2, 'stroke-linejoin': 'round', 'stroke-dasharray': '3 3' }),
    ...jumpMarks.map(p => {
      const [x, y] = pt(p);
      return svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.2, fill: '#e8459a', stroke: '#1c1f3a', 'stroke-width': 1.2 });
    }),
    svg('rect', { x: (sx - 1.8).toFixed(1), y: (sy - 4).toFixed(1), width: 3.6, height: 8, fill: '#b6e03a', stroke: '#1c1f3a', 'stroke-width': 1 }));
}
