import { h } from '../dom.js';

export const Heading = ({ level = 2, text, id, className = 'a-heading' }) =>
  h(`h${level}`, { class: className, id, text });

export const Text = ({ text = '', tone = 'default' }) =>
  h('p', { class: `a-text a-text--${tone}`, text });

export const Kbd = text => h('kbd', { class: 'a-kbd', text });
