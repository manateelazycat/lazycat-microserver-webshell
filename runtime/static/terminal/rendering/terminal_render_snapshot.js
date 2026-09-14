const asText = (value) => String(value ?? "");
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asCursor = (value) => value === null || value === undefined ? "" : String(value);

const freezeDimensions = (dimensions = {}) => Object.freeze({
  cols: Math.max(0, Math.floor(asNumber(dimensions.cols))),
  rows: Math.max(0, Math.floor(asNumber(dimensions.rows))),
  pixelWidth: Math.max(0, Math.floor(asNumber(dimensions.pixelWidth ?? dimensions.pixel_width))),
  pixelHeight: Math.max(0, Math.floor(asNumber(dimensions.pixelHeight ?? dimensions.pixel_height))),
});

export class RenderSnapshot {
  constructor({
    contentGeneration = 0,
    historyGeneration = "",
    appliedCursor = "",
    resizeEpoch = "",
    geometry = {},
    fitGeneration = 0,
    replayGeneration = 0,
    renderGeneration = 0,
    canvasMaterialized = false,
    hasPresentedFrame = false,
  } = {}) {
    this.contentGeneration = asNumber(contentGeneration);
    this.historyGeneration = asText(historyGeneration);
    this.appliedCursor = asCursor(appliedCursor);
    this.resizeEpoch = asText(resizeEpoch);
    this.geometry = freezeDimensions(geometry);
    this.fitGeneration = asNumber(fitGeneration);
    this.replayGeneration = asNumber(replayGeneration);
    this.renderGeneration = asNumber(renderGeneration);
    this.canvasMaterialized = canvasMaterialized === true;
    this.hasPresentedFrame = hasPresentedFrame === true;
    Object.freeze(this);
  }

  equals(other) {
    return other instanceof RenderSnapshot
      && this.contentGeneration === other.contentGeneration
      && this.historyGeneration === other.historyGeneration
      && this.appliedCursor === other.appliedCursor
      && this.resizeEpoch === other.resizeEpoch
      && this.fitGeneration === other.fitGeneration
      && this.replayGeneration === other.replayGeneration
      && this.renderGeneration === other.renderGeneration
      && this.canvasMaterialized === other.canvasMaterialized
      && this.geometry.cols === other.geometry.cols
      && this.geometry.rows === other.geometry.rows
      && this.geometry.pixelWidth === other.geometry.pixelWidth
      && this.geometry.pixelHeight === other.geometry.pixelHeight;
  }

  static fromSession(session, { presented = false, contentGeneration, appliedCursor } = {}) {
    return new RenderSnapshot({
      contentGeneration: contentGeneration ?? session?.terminalContentGeneration,
      historyGeneration: session?.historyGeneration,
      appliedCursor: appliedCursor ?? session?.appliedHistoryCursor,
      resizeEpoch: session?.appliedResizeEpoch || session?.requestedResizeEpoch,
      geometry: {
        cols: session?.term?.cols || session?.serverCols,
        rows: session?.term?.rows || session?.serverRows,
        pixelWidth: session?.serverPixelWidth,
        pixelHeight: session?.serverPixelHeight,
      },
      fitGeneration: session?.measuredFitGeneration,
      replayGeneration: session?.terminalReplayGeneration,
      renderGeneration: session?.renderGeneration,
      canvasMaterialized: session?.hasPresentedFrame === true,
      hasPresentedFrame: presented || session?.hasPresentedFrame === true,
    });
  }
}

export const createRenderSnapshot = (session, options) => RenderSnapshot.fromSession(session, options);
