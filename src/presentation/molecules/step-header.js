import { h } from '../dom.js';

/** Indicador de paso del flujo arcade: «Paso 2 de 3 · Pista». */
export const StepHeader = ({ step, total, label }) =>
  h('p', { class: 'm-step', text: `Paso ${step} de ${total} · ${label}` });
