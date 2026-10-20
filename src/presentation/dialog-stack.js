/**
 * Pila de diálogos modales. Abrir uno nuevo oculta el anterior; volver lo restaura.
 * Escape llama a onCancel del diálogo superior en lugar de cerrarlo a ciegas.
 */
export function createDialogStack({ host, onEmpty }) {
  const stack = [];
  const wired = new WeakSet();
  let closingOnPurpose = false;

  function wire(panel) {
    if (wired.has(panel)) return;
    wired.add(panel);
    panel.el.addEventListener('cancel', event => {
      event.preventDefault();
      if (stack.at(-1)?.panel === panel) stack.at(-1).onCancel?.();
    });
    panel.el.addEventListener('close', () => {
      if (!closingOnPurpose && stack.at(-1)?.panel === panel) stack.at(-1).onCancel?.();
    });
  }

  function show({ panel }) {
    if (!panel.el.isConnected) host.append(panel.el);
    if (!panel.el.open) panel.el.showModal();
    (panel.initialFocus ?? panel.el).focus();
  }

  function hideTop() {
    const top = stack.at(-1);
    if (!top?.panel.el.open) return;
    closingOnPurpose = true;
    top.panel.el.close();
    closingOnPurpose = false;
  }

  return {
    get isOpen() { return stack.length > 0; },
    open(panel, { onCancel } = {}) {
      wire(panel);
      hideTop();
      stack.push({ panel, onCancel });
      show(stack.at(-1));
    },
    back() {
      hideTop();
      stack.pop();
      if (stack.length) show(stack.at(-1));
      else onEmpty?.();
    },
    closeAll() {
      hideTop();
      stack.length = 0;
      onEmpty?.();
    }
  };
}
