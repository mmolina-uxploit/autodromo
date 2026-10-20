import { svg, uniqueId } from '../dom.js';

const W = 200;
const H = 64;

/**
 * Perfil de altura de la pista sobre el cielo de su zona, con marcas donde curva.
 * Decorativo: el largo, las curvas y el desnivel se informan en texto al lado.
 */
export function ProfileGraphic({ profile, bends, sky, ground, accent }) {
  const gradientId = uniqueId('cielo');
  const step = W / (profile.length - 1);
  const points = profile.map((p, i) => `${(i * step).toFixed(1)},${(H - 10 - p * 34).toFixed(1)}`);
  const ticks = bends
    .map((b, i) => (Math.abs(b) >= 0.3 ? svg('rect', {
      x: (i * step - 1.5).toFixed(1), y: 4, width: 3, height: (4 + Math.abs(b) * 8).toFixed(1), rx: 1.5, fill: accent
    }) : null))
    .filter(Boolean);

  return svg('svg', { class: 'a-profile', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {}, svg('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
      ...sky.map((color, i) => svg('stop', { offset: i / (sky.length - 1), 'stop-color': color })))),
    svg('rect', { width: W, height: H, fill: `url(#${gradientId})` }),
    svg('path', { d: `M0,${H} L${points.join(' L')} L${W},${H} Z`, fill: ground, stroke: '#1c1f3a', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
    ...ticks);
}
