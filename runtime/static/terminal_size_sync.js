const terminalDimension = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const shouldSendTerminalSize = ({
  cols,
  rows,
  lastSentCols,
  lastSentRows,
  force = false,
} = {}) => {
  const nextCols = terminalDimension(cols);
  const nextRows = terminalDimension(rows);
  if (nextCols <= 0 || nextRows <= 0) {
    return false;
  }
  return (
    force
    || terminalDimension(lastSentCols) !== nextCols
    || terminalDimension(lastSentRows) !== nextRows
  );
};

export const terminalSizeDiffersFromServer = ({ cols, rows, serverCols, serverRows } = {}) => {
  const nextCols = terminalDimension(cols);
  const nextRows = terminalDimension(rows);
  const remoteCols = terminalDimension(serverCols);
  const remoteRows = terminalDimension(serverRows);
  return (
    nextCols > 0
    && nextRows > 0
    && remoteCols > 0
    && remoteRows > 0
    && (nextCols !== remoteCols || nextRows !== remoteRows)
  );
};
