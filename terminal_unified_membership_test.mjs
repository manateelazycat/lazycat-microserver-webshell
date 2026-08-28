import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalUnifiedMembership } from "./runtime/static/terminal_unified_membership.js";

const pane = (id, tabId, extra = {}) => ({
  id,
  tabId,
  name: "demo",
  closed: false,
  measuredFitGeneration: 1,
  lastUserInteractionAt: 0,
  ...extra,
});

test("unified membership keeps every pane subscribed across tab and focus changes", () => {
  const membership = createTerminalUnifiedMembership();
  const panes = [pane("pane-1", "tab-1"), pane("pane-2", "tab-1"), pane("pane-3", "tab-2")];

  const initial = membership.reconcile({
    targetName: "demo",
    panes,
    activeTabID: "tab-1",
    activePaneID: "pane-1",
  });
  assert.deepEqual(initial.added, panes);
  assert.deepEqual(initial.removed, []);
  assert.deepEqual(membership.snapshot().paneIDs, ["pane-1", "pane-2", "pane-3"]);

  const switched = membership.reconcile({
    targetName: "demo",
    panes,
    activeTabID: "tab-2",
    activePaneID: "pane-3",
  });
  assert.deepEqual(switched.added, []);
  assert.deepEqual(switched.removed, []);
  assert.equal(switched.membershipChanged, false);
  assert.equal(switched.revision, initial.revision);
  assert.deepEqual(membership.snapshot().priorities, {
    "pane-1": 3,
    "pane-2": 3,
    "pane-3": 0,
  });
});

test("unified membership changes only when panes or target change", () => {
  const membership = createTerminalUnifiedMembership();
  const first = pane("pane-1", "tab-1");
  const second = pane("pane-2", "tab-1");
  const initial = membership.reconcile({ targetName: "demo", panes: [first] });

  const added = membership.reconcile({ targetName: "demo", panes: [first, second] });
  assert.deepEqual(added.added, [second]);
  assert.deepEqual(added.removed, []);
  assert.equal(added.revision, initial.revision + 1);

  const removed = membership.reconcile({ targetName: "demo", panes: [second] });
  assert.deepEqual(removed.added, []);
  assert.deepEqual(removed.removed, [first]);

  const replacement = pane("pane-9", "tab-9", { name: "other" });
  const changed = membership.reconcile({ targetName: "other", panes: [replacement] });
  assert.equal(changed.targetChanged, true);
  assert.deepEqual(changed.removed, [second]);
  assert.deepEqual(changed.added, [replacement]);

  const replacementObject = pane("pane-9", "tab-9", { name: "other" });
  const replaced = membership.reconcile({ targetName: "other", panes: [replacementObject] });
  assert.equal(replaced.membershipChanged, true);
  assert.deepEqual(replaced.removed, [replacement]);
  assert.deepEqual(replaced.added, [replacementObject]);
});

test("unified membership excludes closed, foreign, and unsized panes", () => {
  const membership = createTerminalUnifiedMembership();
  const ready = pane("pane-1", "tab-1");
  const result = membership.reconcile({
    targetName: "demo",
    panes: [
      ready,
      pane("closed", "tab-1", { closed: true }),
      pane("foreign", "tab-1", { name: "other" }),
      pane("unsized", "tab-1", { measuredFitGeneration: 0, initialCols: 0, initialRows: 0, term: { cols: 0, rows: 0 } }),
    ],
  });
  assert.deepEqual(result.members, [ready]);
  assert.deepEqual(membership.snapshot().paneIDs, ["pane-1"]);
});
