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
  let overlayHost = null;
  let overlayText = "";

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
    overlayHost = null;
    overlayText = "";
    view.hide();
  };

  const showOverlay = (session, label) => {
    const host = session?.terminalHost;
    const text = String(label || "").trim();
    if (!host) {
      hideOverlay();
      return false;
    }
    if (overlayHost === host && overlayText === text) {
      return true;
    }
    overlayHost = host;
    overlayText = text;
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

  const handleFileDrop = (event) => {
    if (!started || disposed || !isFileDrag(event?.dataTransfer)) {
      return false;
    }
    consume(event);
    hideOverlay();
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
    if (!started || disposed || !isFileDrag(event?.dataTransfer)) {
      return false;
    }
    const related = event?.relatedTarget;
    if (related && documentObject?.documentElement?.contains?.(related)) {
      return false;
    }
    hideOverlay();
    return true;
  };

  const lifecycle = lifecycleFactory({
    windowObject,
    documentObject,
    handlers: {
      onDragEnter: handleFileDragOver,
      onDragOver: handleFileDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleFileDrop,
      onDragEnd: hideOverlay,
    },
  });

  return Object.freeze({
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      hideOverlay();
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
