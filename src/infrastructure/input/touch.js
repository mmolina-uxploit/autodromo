/**
 * Control de "mantener presionado" con Pointer Events: admite varios dedos,
 * captura el puntero para no perderlo al deslizar y bloquea el menú contextual.
 */
export function bindHoldControl(element, { onPress, onRelease }) {
  const pointers = new Set();

  function down(event) {
    event.preventDefault();
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      /* el puntero ya terminó: se sigue sin captura */
    }
    const wasIdle = pointers.size === 0;
    pointers.add(event.pointerId);
    if (wasIdle) onPress();
  }

  function up(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0) onRelease();
  }

  const blockMenu = event => event.preventDefault();

  element.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, up);
  element.addEventListener('contextmenu', blockMenu);

  return function release() {
    if (pointers.size) { pointers.clear(); onRelease(); }
  };
}
