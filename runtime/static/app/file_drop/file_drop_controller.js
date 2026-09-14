import {
  dataTransferHasDirectory,
  dropFiles,
  dropPreview,
  isFileDrag,
  overlayLabel,
} from "./file_drop_model.js";
import { createAppFileDropView } from "./file_drop_view.js";
import { createAppFileDropLifecycle } from "./file_drop_lifecycle.js";

const noop = () => {};
const identity = (value) => value;

export function createAppFileDropController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  translate = identity,
  isBlocked = () => false,
  resolveSessionAtPoint = () => null,
  activateSession = noop,
  ingestFiles = async () => ({ handled: false }),
  showToast = noop,
  viewFactory = createAppFileDropView,
  lifecycleFactory = createAppFileDropLifecycle,
} = {}) {
  const view = viewFactory({ documentObject });
  let started = false;
  let disposed = false;
  let dragDepth = 0;

  const consume = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  };

  const setDropEffect = (event, effect) => {
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = effect;
    }
  };

  const hideOverlay = () => {
    view.hide();
  };

  const endFileDrag = () => {
    dragDepth = 0;
    hideOverlay();
  };

  const showOverlay = (session, label) => {
    const host = session?.terminalHost;
    const text = String(label || "").trim();
    if (!host) {
      hideOverlay();
      return false;
    }
    return view.show(host, text) === true;
  };

  const handleFileDragOver = (event) => {
    if (!started || disposed || !isFileDrag(event?.dataTransfer)) {
      return false;
    }
    consume(event);
    if (isBlocked()) {
      setDropEffect(event, "none");
      hideOverlay();
      return true;
    }
    const session = resolveSessionAtPoint(event.clientX, event.clientY);
    if (!session || session.closed) {
      setDropEffect(event, "none");
      hideOverlay();
      return true;
    }
    if (dataTransferHasDirectory(event.dataTransfer)) {
      setDropEffect(event, "none");
      showOverlay(session, translate("暂不支持拖入文件夹。"));
      return true;
    }
    setDropEffect(event, "copy");
    showOverlay(session, overlayLabel(dropPreview(event.dataTransfer), translate));
    return true;
  };

  const handleFileDragEnter = (event) => {
    if (!started || disposed || !isFileDrag(event?.dataTransfer)) {
      return false;
    }
    dragDepth += 1;
    return handleFileDragOver(event);
  };

  const handleFileDrop = (event) => {
    if (!started || disposed || !isFileDrag(event?.dataTransfer)) {
      return false;
    }
    consume(event);
    endFileDrag();
    if (isBlocked()) {
      return true;
    }
    const session = resolveSessionAtPoint(event.clientX, event.clientY);
    if (!session || session.closed) {
      return true;
    }
    if (dataTransferHasDirectory(event.dataTransfer)) {
      showToast(translate("暂不支持拖入文件夹。"));
      return true;
    }
    const files = dropFiles(event.dataTransfer);
    if (files.length === 0) {
      return true;
    }
    activateSession(session, event.clientX, event.clientY);
    ingestFiles(session, files);
    return true;
  };

  const handleDragLeave = (event) => {
    if (!started || disposed || (dragDepth === 0 && !isFileDrag(event?.dataTransfer))) {
      return false;
    }
    // Internal target changes enter the new element before leaving the old one.
    // Balance those events because relatedTarget may be null inside the page.
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth > 0) {
      return false;
    }
    hideOverlay();
    return true;
  };

  const lifecycle = lifecycleFactory({
    windowObject,
    documentObject,
    handlers: {
      onDragEnter: handleFileDragEnter,
      onDragOver: handleFileDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleFileDrop,
      onDragEnd: endFileDrag,
    },
  });

  return Object.freeze({
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      endFileDrag();
      view.dispose();
      lifecycle.dispose();
      return true;
    },
    start() {
      if (started || disposed) {
        return false;
      }
      started = true;
      lifecycle.start();
      return true;
    },
  });
}
