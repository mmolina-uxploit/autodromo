/**
 * Zonas visuales. Cielo, niebla y pista salen de design/ecosistema.json;
 * tests/design-coherence.test.js falla si se desvían. Defensas, fosos y utilería
 * usan solo colores de la paleta del ecosistema.
 */
export const ZONES = Object.freeze([
  {
    id: 'bajo-autopista', name: 'Bajo Autopista', time: 'noche',
    sky: ['#05060f', '#10142e', '#2a2f5c'], fog: '#2a2f5c',
    road: { asphalt: ['#d8b2ab', '#cfa8a1'], rumble: ['#7f93b0', '#efe8dc'], lane: '#f6eee6', ground: ['#55627f', '#4f5d7a'] },
    wall: { face: ['#7f93b0', '#4f5d7a'], top: '#c7cbe0', stripe: '#ff7a24', height: 1.1 },
    gap: { top: '#10142e', bottom: '#05060f', shimmer: '#ffd36a' },
    props: ['pillar', 'billboard', 'pillar'], lamps: true,
    backdrop: 'viaduct', accent: '#ffd36a', smoke: '#c7cbe0', dust: '#7f93b0'
  },
  {
    id: 'costa-rosa', name: 'Costa Rosa', time: 'día',
    sky: ['#efebe4', '#f4dccf', '#efa1e2'], fog: '#f2c9dc',
    road: { asphalt: ['#5f6b78', '#5a6572'], rumble: ['#ee9fde', '#f4efe6'], lane: '#f4efe6', ground: ['#e9d9c8', '#e2d0bd'] },
    wall: { face: ['#efebe4', '#e6c0b9'], top: '#fff4dc', stripe: '#ee9fde', height: 0.9 },
    gap: { top: '#3fb3b0', bottom: '#353a6e', shimmer: '#efebe4' },
    props: ['palm', 'palm', 'billboard'], lamps: false,
    backdrop: 'coast', accent: '#f3c4a6', smoke: '#efebe4', dust: '#e6c0b9'
  },
  {
    id: 'distrito-torre', name: 'Distrito Torre', time: 'día',
    sky: ['#4f9ee8', '#8fcdef', '#d6ecf8'], fog: '#d6ecf8',
    road: { asphalt: ['#b9bccb', '#b2b5c5'], rumble: ['#ee6f93', '#f4f6fa'], lane: '#61d3f2', ground: ['#c7cbe0', '#bfc3da'] },
    wall: { face: ['#c7cbe0', '#7f93b0'], top: '#efebe4', stripe: '#5fe3f0', height: 1.2 },
    gap: { top: '#4f5d7a', bottom: '#1c1f3a', shimmer: '#5fe3f0' },
    props: ['tree', 'billboard', 'tree'], lamps: true,
    backdrop: 'towers', accent: '#b6e03a', smoke: '#efebe4', dust: '#c7cbe0'
  },
  {
    id: 'anillo-neon', name: 'Anillo Neón', time: 'noche',
    sky: ['#141a3a', '#3a2f7a', '#8a6fe0'], fog: '#3a2f7a',
    road: { asphalt: ['#2b3160', '#283058'], rumble: ['#5fe8f0', '#ff4fa8'], lane: '#c8f05a', ground: ['#1a1840', '#1f1d4a'] },
    wall: { face: ['#2b3160', '#1f1d4a'], top: '#5fe8f0', stripe: '#ff4fa8', height: 1.1, neon: true },
    gap: { top: '#141a3a', bottom: '#05060f', shimmer: '#ff4fa8' },
    props: ['beacon', 'screen', 'beacon'], lamps: false,
    backdrop: 'neon', accent: '#5fe8f0', smoke: '#8a6fe0', dust: '#3a2f7a'
  }
].map(zone => Object.freeze(zone)));

export const START_LINE_COLOR = '#efe9dc';

export const findZone = id => ZONES.find(z => z.id === id) ?? ZONES[0];
