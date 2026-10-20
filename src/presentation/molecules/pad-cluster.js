import { h } from '../dom.js';

export const PadCluster = ({ label, pads }) =>
  h('div', { class: 'm-pad-cluster', role: 'group', 'aria-label': label }, pads);
