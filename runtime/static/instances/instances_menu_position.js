// Only the desktop sidebar menu leaves its anchor's DOM subtree. The original
// node and listeners are retained so all menu actions keep their owners.
export function createInstancesMenuPositioner({ documentObject, windowObject, elements }) {
  let portalled = false;
  let frame = 0;
  let observer = null;
  const { panel, root, button } = elements;

  const position = () => {
    if (!portalled || panel.hidden) return;
    const viewport = windowObject.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 8;
    const rightEdge = (viewport?.offsetLeft || 0) + (viewport?.width || documentObject.documentElement.clientWidth) - 8;
    const bottomEdge = (viewport?.offsetTop || 0) + (viewport?.height || windowObject.innerHeight) - 8;
    const width = Math.min(224, Math.max(0, rightEdge - leftEdge));
    const anchor = button.getBoundingClientRect();
    const left = Math.max(leftEdge, Math.min(anchor.right - width, rightEdge - width));
    const top = Math.max((viewport?.offsetTop || 0) + 8, anchor.bottom + 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, bottomEdge - top)}px`;
  };
  const schedule = () => {
    if (!portalled || frame) return;
    frame = windowObject.requestAnimationFrame(() => { frame = 0; position(); });
  };
  return Object.freeze({
    schedule,
    open() {
      if (!panel || !root || !button || !documentObject.body.classList.contains("desktop-workspace-mode")) return;
      portalled = true;
      panel.classList.add("desktop-workspace-menu-panel");
      documentObject.body.append(panel);
      position();
      observer ||= new windowObject.ResizeObserver(schedule);
      observer.observe(root.parentElement);
      observer.observe(panel);
    },
    close() {
      if (frame) windowObject.cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      if (!portalled) return;
      portalled = false;
      panel.classList.remove("desktop-workspace-menu-panel");
      for (const property of ["left", "right", "top", "bottom", "width", "max-height"]) panel.style.removeProperty(property);
      root.append(panel);
    },
  });
}
