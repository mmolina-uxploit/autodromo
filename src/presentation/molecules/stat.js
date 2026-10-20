import { h } from '../dom.js';
import { Readout } from '../atoms/readout.js';

export function Stat({ label, size = 'm', align = 'start', initial = '' }) {
  const value = Readout({ size, initial });
  const caption = Readout({ size: 'caption', initial: label });
  return {
    el: h('div', { class: `m-stat m-stat--${align}` }, value.el, caption.el),
    setValue: value.set,
    setCaption: caption.set
  };
}
