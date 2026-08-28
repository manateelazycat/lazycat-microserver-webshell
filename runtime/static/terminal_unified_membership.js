const normalizeID = (value) => String(value || "").trim();

const paneIsEligible = (pane, targetName) => Boolean(
  pane
  && pane.closed !== true
  && normalizeID(pane.name) === targetName
  && (
    Number(pane.measuredFitGeneration || 0) > 0
    || (Number(pane.initialCols || 0) >= 2 && Number(pane.initialRows || 0) >= 1)
    || (Number(pane.term?.cols || 0) >= 2 && Number(pane.term?.rows || 0) >= 1)
  )
);

const panePriority = (pane, activeTabID, activePaneID) => {
  if (normalizeID(pane?.id) === activePaneID) {
    return 0;
  }
  if (normalizeID(pane?.tabId || pane?.tabID) === activeTabID) {
    return 1;
  }
  return Number(pane?.lastUserInteractionAt || 0) > 0 ? 2 : 3;
};

export const createTerminalUnifiedMembership = () => {
  let targetName = "";
  let revision = 0;
  let members = new Map();

  const reconcile = ({
    targetName: nextTargetName,
    panes = [],
    activeTabID = "",
    activePaneID = "",
  } = {}) => {
    const normalizedTarget = normalizeID(nextTargetName);
    const normalizedTab = normalizeID(activeTabID);
    const normalizedPane = normalizeID(activePaneID);
    const targetChanged = normalizedTarget !== targetName;
    const previous = targetChanged ? new Map() : members;
    const removed = targetChanged ? Array.from(members.values(), (entry) => entry.pane) : [];
    const next = new Map();
    const added = [];
    const priorities = [];

    for (const pane of Array.from(panes || [])) {
      const paneID = normalizeID(pane?.id);
      if (!paneID || !paneIsEligible(pane, normalizedTarget) || next.has(paneID)) {
        continue;
      }
      const priority = panePriority(pane, normalizedTab, normalizedPane);
      const prior = previous.get(paneID);
      const entry = { pane, priority };
      next.set(paneID, entry);
      if (!prior || prior.pane !== pane) {
        added.push(pane);
        if (prior?.pane) {
          removed.push(prior.pane);
        }
      }
      if (!prior || prior.priority !== priority || prior.pane !== pane) {
        priorities.push({ pane, priority });
      }
    }

    if (!targetChanged) {
      for (const [paneID, entry] of previous) {
        if (!next.has(paneID)) {
          removed.push(entry.pane);
        }
      }
    }
    const membershipChanged = targetChanged || added.length > 0 || removed.length > 0;
    if (membershipChanged) {
      revision += 1;
    }
    targetName = normalizedTarget;
    members = next;
    return {
      targetName,
      targetChanged,
      membershipChanged,
      revision,
      added,
      removed,
      priorities,
      members: Array.from(members.values(), (entry) => entry.pane),
    };
  };

  const clear = () => {
    const removed = Array.from(members.values(), (entry) => entry.pane);
    if (removed.length > 0 || targetName) {
      revision += 1;
    }
    members = new Map();
    targetName = "";
    return removed;
  };

  const snapshot = () => ({
    targetName,
    revision,
    paneIDs: Array.from(members.keys()),
    priorities: Object.fromEntries(Array.from(members, ([paneID, entry]) => [paneID, entry.priority])),
  });

  return { reconcile, clear, snapshot };
};
