/**
 * Zonas visuales. Cielo, niebla, pista y atmósfera salen de design/ecosistema.json;
 * tests/design-coherence.test.js falla si se desvían. Defensas, fosos y utilería
 * usan solo colores de la paleta del ecosistema.
 *
 * `atmosphere` es el acabado de animé realista del escenario: cenit más profundo, resplandor
 * del horizonte [color, opacidad], bruma de distancia [color, opacidad], nubes con volumen
 * (iluminadas desde arriba o desde abajo), sol, luna, mar, ventanas encendidas, haces de luz,
 * brillo del asfalto que refleja el cielo (`sheen`) y cuánto refleja como piso mojado (`wet`).
 */
export const ZONES = Object.freeze([
  {
    id: 'bajo-autopista', name: 'Bajo Autopista', time: 'noche',
    sky: ['#05060f', '#10142e', '#2a2f5c'], fog: '#2a2f5c',
    road: { asphalt: ['#d8b2ab', '#cfa8a1'], rumble: ['#7f93b0', '#efe8dc'], lane: '#f6eee6', ground: ['#55627f', '#4f5d7a'] },
    wall: { face: ['#7f93b0', '#4f5d7a'], top: '#c7cbe0', stripe: '#ff7a24', height: 1.1 },
    gap: { top: '#10142e', bottom: '#05060f', shimmer: '#ffd36a' },
    props: ['pillar', 'billboard', 'pillar'], lamps: true,
    backdrop: 'viaduct', accent: '#ffd36a', smoke: '#c7cbe0', dust: '#7f93b0',
    atmosphere: {
      zenith: '#020309', glow: ['#ff7a24', 0.2], haze: ['#2a2f5c', 0.55],
      cloud: { light: '#4a3f66', shade: '#151a35', rim: '#ff9a4a', lit: 'below', count: 4 },
      moon: '#fff4dc', windows: ['#ffd36a', '#fff4dc', '#ff7a24', '#9fd8ff'],
      sheen: 0.18, wet: 0.55
    }
  },
  {
    id: 'costa-rosa', name: 'Costa Rosa', time: 'día',
    sky: ['#efebe4', '#f4dccf', '#efa1e2'], fog: '#f2c9dc',
    road: { asphalt: ['#5f6b78', '#5a6572'], rumble: ['#ee9fde', '#f4efe6'], lane: '#f4efe6', ground: ['#e9d9c8', '#e2d0bd'] },
    wall: { face: ['#efebe4', '#e6c0b9'], top: '#fff4dc', stripe: '#ee9fde', height: 0.9 },
    gap: { top: '#3fb3b0', bottom: '#353a6e', shimmer: '#efebe4' },
    props: ['palm', 'palm', 'billboard'], lamps: false,
    backdrop: 'coast', accent: '#f3c4a6', smoke: '#efebe4', dust: '#e6c0b9',
    atmosphere: {
      zenith: '#b3b2e2', glow: ['#f3c4a6', 0.55], haze: ['#f2c9dc', 0.6],
      cloud: { light: '#fff1de', shade: '#c99cc6', rim: '#fff4dc', lit: 'below', count: 7 },
      sun: { core: '#fff8e6', halo: '#ffcf9e' },
      sea: { far: '#f4bfe0', near: '#c77fb8', glitter: '#fff4dc' },
      sheen: 0.22, wet: 0
    }
  },
  {
    id: 'distrito-torre', name: 'Distrito Torre', time: 'día',
    sky: ['#4f9ee8', '#8fcdef', '#d6ecf8'], fog: '#d6ecf8',
    road: { asphalt: ['#b9bccb', '#b2b5c5'], rumble: ['#ee6f93', '#f4f6fa'], lane: '#61d3f2', ground: ['#c7cbe0', '#bfc3da'] },
    wall: { face: ['#c7cbe0', '#7f93b0'], top: '#efebe4', stripe: '#5fe3f0', height: 1.2 },
    gap: { top: '#4f5d7a', bottom: '#1c1f3a', shimmer: '#5fe3f0' },
    props: ['tree', 'billboard', 'tree'], lamps: true,
    backdrop: 'towers', accent: '#b6e03a', smoke: '#efebe4', dust: '#c7cbe0',
    atmosphere: {
      zenith: '#2a6cc9', glow: ['#fff4dc', 0.35], haze: ['#e6f2fa', 0.55],
      cloud: { light: '#ffffff', shade: '#b5c9e2', rim: '#ffffff', lit: 'above', count: 7 },
      glass: '#d6ecf8',
      sheen: 0.2, wet: 0
    }
  },
  {
    id: 'anillo-neon', name: 'Anillo Neón', time: 'noche',
    sky: ['#141a3a', '#3a2f7a', '#8a6fe0'], fog: '#3a2f7a',
    road: { asphalt: ['#2b3160', '#283058'], rumble: ['#5fe8f0', '#ff4fa8'], lane: '#c8f05a', ground: ['#1a1840', '#1f1d4a'] },
    wall: { face: ['#2b3160', '#1f1d4a'], top: '#5fe8f0', stripe: '#ff4fa8', height: 1.1, neon: true },
    gap: { top: '#141a3a', bottom: '#05060f', shimmer: '#ff4fa8' },
    props: ['beacon', 'screen', 'beacon'], lamps: false,
    backdrop: 'neon', accent: '#5fe8f0', smoke: '#8a6fe0', dust: '#3a2f7a',
    atmosphere: {
      zenith: '#07081c', glow: ['#ff4fa8', 0.24], haze: ['#3a2f7a', 0.5],
      cloud: { light: '#5a4699', shade: '#1a1640', rim: '#ff4fa8', lit: 'below', count: 4 },
      windows: ['#5fe8f0', '#ff4fa8', '#c8f05a', '#fff4dc'], beams: ['#5fe8f0', '#ff4fa8'],
      sheen: 0.16, wet: 0.7
    }
  },
  {
    id: 'valle-alto', name: 'Valle Alto', time: 'día',
    sky: ['#2a74d6', '#6db3ee', '#d4ecf7'], fog: '#b9dc9a',
    road: { asphalt: ['#6b717b', '#666c76'], rumble: ['#6b717b', '#666c76'], lane: '#f4f6fa', ground: ['#79c24b', '#70b944'], edgeLine: true },
    wall: { face: ['#c7cbe0', '#7f93b0'], top: '#efebe4', stripe: '#b6e03a', height: 0.45 },
    gap: { top: '#4f5d7a', bottom: '#1c1f3a', shimmer: '#5fe3f0' },
    // Campo pintado: parcelas en pares de color (surco, entresurco), bordos, matas y bacheos.
    fields: {
      colors: [['#7ec44e', '#75ba47'], ['#a3d65c', '#98cc53'], ['#5a9c3e', '#529336'], ['#bcd56a', '#b1cb5f'], ['#d8bf62', '#ccb257'], ['#86c25a', '#7cb852']],
      levee: '#b5de82',
      patches: ['#5d636c', '#7a808a'],
      wear: { crack: 'rgba(28,31,58,0.45)', stain: 'rgba(28,31,58,0.14)' },
      tufts: { dark: '#3f7f3a', light: '#a8dc6c', flowers: ['#fff4dc', '#ffd36a'] }
    },
    props: ['oak', 'oak', 'house'], lamps: false, poles: true, signs: 'rural',
    backdrop: 'valley', accent: '#b6e03a', smoke: '#efebe4', dust: '#c7cbe0',
    atmosphere: {
      zenith: '#155bbf', glow: ['#fff4dc', 0.3], haze: ['#d6edf4', 0.32],
      cloud: { light: '#ffffff', shade: '#a8bfdd', rim: '#ffffff', lit: 'above', count: 6, tall: true },
      sheen: 0.14, wet: 0
    }
  }
].map(zone => Object.freeze(zone)));

export const START_LINE_COLOR = '#efe9dc';

export const findZone = id => ZONES.find(z => z.id === id) ?? ZONES[0];
