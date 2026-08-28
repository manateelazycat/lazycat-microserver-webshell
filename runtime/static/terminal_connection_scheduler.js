const defaultNow = () => Date.now();

const normalizeCapacity = (value) => Math.max(1, Math.floor(Number(value) || 0));

const normalizePriority = (value) => {
  const priority = Math.floor(Number(value));
  return Number.isFinite(priority) ? Math.max(0, Math.min(4, priority)) : 4;
};

const compareRecords = (left, right) => {
  const leftDemand = left.demand || {};
  const rightDemand = right.demand || {};
  return normalizePriority(leftDemand.priority) - normalizePriority(rightDemand.priority)
    || Number(rightDemand.lastUserInteractionAt || 0) - Number(leftDemand.lastUserInteractionAt || 0)
    || Number(rightDemand.lastBecameVisibleAt || 0) - Number(leftDemand.lastBecameVisibleAt || 0)
    || Number(rightDemand.lastOutputAt || 0) - Number(leftDemand.lastOutputAt || 0)
    || left.registrationOrder - right.registrationOrder;
};

export const createTerminalConnectionScheduler = ({
  capacity = 3,
  connect,
  disconnect,
  now = defaultNow,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  retryDelay = (attempt) => Math.min(10_000, 500 * (2 ** Math.min(Math.max(0, attempt), 8))),
  onStateChange = () => {},
} = {}) => {
  if (typeof connect !== "function" || typeof disconnect !== "function") {
    throw new TypeError("terminal connection scheduler requires connect and disconnect callbacks");
  }

  let safeCapacity = normalizeCapacity(capacity);
  const records = new Map();
  let online = true;
  let currentGeneration = 0;
  let nextRegistrationOrder = 1;
  let nextLeaseID = 1;
  let reconciling = false;
  let reconcileAgain = false;
  let peakActiveCount = 0;
  let capacityInvariantViolations = 0;

  const activeRecords = () => Array.from(records.values()).filter((record) => Boolean(record.lease));

  const snapshot = () => {
    const sessions = Array.from(records.values()).map((record) => ({
      session: record.session,
      status: record.status,
      demand: record.demand ? { ...record.demand } : null,
      lease: record.lease ? { ...record.lease } : null,
      retryAttempt: record.retryAttempt,
    }));
    const active = sessions.filter((record) => record.lease);
    const counts = {
      connecting: active.filter((record) => record.lease.state === "connecting").length,
      open: active.filter((record) => record.lease.state === "open" || record.lease.state === "leased").length,
      closing: active.filter((record) => record.lease.state === "closing").length,
      queued: sessions.filter((record) => record.status === "queued").length,
      parked: sessions.filter((record) => record.status === "parked").length,
      backoff: sessions.filter((record) => record.status === "backoff").length,
    };
    const activeCount = counts.connecting + counts.open + counts.closing;
    peakActiveCount = Math.max(peakActiveCount, activeCount);
    if (activeCount > safeCapacity) {
      capacityInvariantViolations += 1;
    }
    return {
      capacity: safeCapacity,
      online,
      generation: currentGeneration,
      activeCount,
      peakActiveCount,
      capacityInvariantViolations,
      counts,
      sessions,
    };
  };

  const emit = () => onStateChange(snapshot());

  const clearRetry = (record) => {
    if (record.retryTimer) {
      clearTimer(record.retryTimer);
      record.retryTimer = 0;
    }
  };

  const demandIsCurrent = (record) => Boolean(
    record.demand
    && (record.demand.generation === undefined || record.demand.generation === currentGeneration)
  );

  const eligibleQueuedRecords = () => Array.from(records.values())
    .filter((record) => (
      !record.disposed
      && !record.lease
      && !record.retryTimer
      && !record.parkedByPreempt
      && demandIsCurrent(record)
    ))
    .sort(compareRecords);

  const grant = (record) => {
    if (!online || record.disposed || record.lease || !demandIsCurrent(record)) {
      return false;
    }
    const lease = {
      leaseID: nextLeaseID,
      state: "connecting",
      reason: record.demand.reason || "demand",
      priority: normalizePriority(record.demand.priority),
      requestedAt: Number(record.demand.requestedAt || now()),
      grantedAt: now(),
      generation: record.demand.generation,
      allowHidden: record.demand.allowHidden === true,
      closingReason: "",
    };
    nextLeaseID += 1;
    record.lease = lease;
    record.parkedByPreempt = false;
    record.status = "connecting";
    emit();
    try {
      Promise.resolve(connect(record.session, { ...lease })).catch((error) => {
        notifyFailure(record.session, lease.leaseID, error);
      });
    } catch (error) {
      notifyFailure(record.session, lease.leaseID, error);
    }
    return true;
  };

  const requestDisconnect = (record, reason) => {
    const lease = record.lease;
    if (!lease || lease.state === "closing") {
      return false;
    }
    lease.state = "closing";
    lease.closingReason = reason;
    record.status = "releasing";
    emit();
    try {
      disconnect(record.session, reason, { ...lease });
    } catch (error) {
      // The slot stays occupied until the host confirms the close.
    }
    return true;
  };

  const shouldPreempt = (candidate, victim) => {
    if (!candidate?.demand || !victim?.demand || victim.lease?.state === "closing") {
      return false;
    }
    const candidatePriority = normalizePriority(candidate.demand.priority);
    const victimPriority = normalizePriority(victim.demand.priority);
    return candidatePriority <= 2 && candidatePriority < victimPriority;
  };

  const reconcile = () => {
    if (reconciling) {
      reconcileAgain = true;
      return snapshot();
    }
    reconciling = true;
    try {
      if (!online) {
        for (const record of activeRecords()) {
          requestDisconnect(record, "network_offline");
        }
        for (const record of records.values()) {
          if (!record.lease && !record.retryTimer && record.demand) {
            record.status = "parked";
          }
        }
        emit();
        return snapshot();
      }

      let active = activeRecords();
      const closingCount = active.filter((record) => record.lease?.state === "closing").length;
      const excessActive = Math.max(0, active.length - safeCapacity - closingCount);
      if (excessActive > 0) {
        const overCapacityVictims = active
          .filter((record) => record.lease?.state !== "closing")
          .sort((left, right) => compareRecords(right, left));
        for (const victim of overCapacityVictims.slice(0, excessActive)) {
          requestDisconnect(victim, "capacity_reduced");
        }
        active = activeRecords();
      }

      // A pane parked by preemption must be allowed to reclaim the only Fast
      // slot when the higher-priority replacement disappears. Without this
      // idle-pool recovery, the final surviving pane remains parked forever
      // and pending input eventually expires even though no lease is active.
      const hasNonParkedDemand = Array.from(records.values()).some((record) => (
        !record.disposed
        && !record.parkedByPreempt
        && !record.retryTimer
        && demandIsCurrent(record)
      ));
      if (active.length === 0 && !hasNonParkedDemand) {
        for (const record of records.values()) {
          if (
            record.parkedByPreempt
            && !record.disposed
            && !record.lease
            && !record.retryTimer
            && demandIsCurrent(record)
          ) {
            record.parkedByPreempt = false;
            record.status = "queued";
          }
        }
      }
      let queued = eligibleQueuedRecords();
      while (active.length < safeCapacity && queued.length > 0) {
        grant(queued.shift());
        active = activeRecords();
      }

      queued = eligibleQueuedRecords();
      const victims = activeRecords()
        .filter((record) => record.lease?.state !== "closing")
        .sort((left, right) => compareRecords(right, left));
      for (const candidate of queued) {
        const victimIndex = victims.findIndex((victim) => shouldPreempt(candidate, victim));
        if (victimIndex < 0) {
          continue;
        }
        const [victim] = victims.splice(victimIndex, 1);
        requestDisconnect(victim, "scheduler_preempt");
      }

      for (const record of records.values()) {
        if (!record.lease && !record.retryTimer && record.demand) {
          record.status = demandIsCurrent(record) && !record.parkedByPreempt ? "queued" : "parked";
        }
      }
      emit();
      return snapshot();
    } finally {
      reconciling = false;
      if (reconcileAgain) {
        reconcileAgain = false;
        reconcile();
      }
    }
  };

  const register = (session) => {
    if (!session || records.has(session)) {
      return false;
    }
    records.set(session, {
      session,
      registrationOrder: nextRegistrationOrder,
      status: "registered",
      demand: null,
      lease: null,
      retryTimer: 0,
      retryAttempt: 0,
      parkedByPreempt: false,
      disposed: false,
    });
    nextRegistrationOrder += 1;
    emit();
    return true;
  };

  const request = (session, demand = {}) => {
    const record = records.get(session);
    if (!record || record.disposed) {
      return false;
    }
    if (demand.immediate === true) {
      clearRetry(record);
    }
    record.demand = {
      ...record.demand,
      ...demand,
      priority: normalizePriority(demand.priority ?? record.demand?.priority),
      requestedAt: Number(demand.requestedAt || now()),
    };
    if (normalizePriority(record.demand.priority) <= 2) {
      record.parkedByPreempt = false;
    }
    if (!record.lease && !record.retryTimer) {
      record.status = demandIsCurrent(record) && !record.parkedByPreempt ? "queued" : "parked";
    }
    reconcile();
    return true;
  };

  const updatePriority = (session, demand = {}) => request(session, demand);

  const release = (session, reason = "demand_released") => {
    const record = records.get(session);
    if (!record) {
      return false;
    }
    record.demand = null;
    record.parkedByPreempt = false;
    clearRetry(record);
    if (record.lease) {
      requestDisconnect(record, reason);
    } else {
      record.status = "parked";
    }
    reconcile();
    return true;
  };

  const scheduleBackoff = (record) => {
    clearRetry(record);
    if (!record.demand || record.disposed || !online) {
      record.status = record.disposed ? "disposed" : "parked";
      emit();
      return;
    }
    const attempt = record.retryAttempt;
    const delay = Math.max(0, Math.floor(Number(retryDelay(attempt, record.session)) || 0));
    record.retryAttempt = Math.min(20, attempt + 1);
    record.status = "backoff";
    record.retryTimer = setTimer(() => {
      record.retryTimer = 0;
      if (record.disposed || !record.demand) {
        return;
      }
      record.status = online ? "queued" : "parked";
      reconcile();
    }, delay);
    emit();
  };

  const notifyConnecting = (session, leaseID) => {
    const record = records.get(session);
    if (!record?.lease || record.lease.leaseID !== leaseID || record.lease.state === "closing") {
      return false;
    }
    record.lease.state = "connecting";
    record.status = "connecting";
    emit();
    return true;
  };

  const notifyOpen = (session, leaseID) => {
    const record = records.get(session);
    if (!record?.lease || record.lease.leaseID !== leaseID || record.lease.state === "closing") {
      return false;
    }
    record.lease.state = "open";
    record.lease.openedAt = now();
    record.status = "leased";
    emit();
    return true;
  };

  const notifyReplayReady = (session, leaseID) => {
    const record = records.get(session);
    if (!record?.lease || record.lease.leaseID !== leaseID || record.lease.state === "closing") {
      return false;
    }
    record.lease.state = "leased";
    record.lease.replayReadyAt = now();
    record.retryAttempt = 0;
    record.status = "leased";
    emit();
    return true;
  };

  const notifyFailure = (session, leaseID, error, { awaitClose = false } = {}) => {
    const record = records.get(session);
    if (!record?.lease || record.lease.leaseID !== leaseID) {
      return false;
    }
    record.lastError = error;
    if (awaitClose) {
      requestDisconnect(record, "network_failure");
      return true;
    }
    record.lease = null;
    scheduleBackoff(record);
    reconcile();
    return true;
  };

  const notifyClosed = (session, leaseID, closeInfo = {}) => {
    const record = records.get(session);
    if (!record?.lease || record.lease.leaseID !== leaseID) {
      return false;
    }
    const closingReason = record.lease.closingReason || String(closeInfo.reason || "");
    record.lease = null;
    if (record.disposed) {
      records.delete(session);
      emit();
      reconcile();
      return true;
    } else if ([
      "scheduler_preempt",
      "session_closed",
      "tab_or_target_removed",
      "page_disposed",
      "network_offline",
      "demand_released",
      "capacity_reduced",
      "background_tab_parked",
      "tab_priority_changed",
    ].includes(closingReason)) {
      const resumedBeforePreemptClosed = Boolean(
        closingReason === "scheduler_preempt"
        && demandIsCurrent(record)
        && normalizePriority(record.demand?.priority) <= 2
      );
      record.parkedByPreempt = closingReason === "scheduler_preempt" && !resumedBeforePreemptClosed;
      record.status = record.demand && online && !record.parkedByPreempt ? "queued" : "parked";
    } else {
      scheduleBackoff(record);
    }
    reconcile();
    return true;
  };

  // A physical multiplexed socket can take every logical stream down at
  // once. Clear those leases as a batch without calling disconnect again on
  // already-closed logical sockets; the topology owner will request fresh
  // leases after it creates the next physical transport generation.
  const invalidateTransport = (reason = "network_failure", { immediate = false } = {}) => {
    let invalidated = false;
    for (const record of records.values()) {
      if (!record.lease) {
        continue;
      }
      record.lease = null;
      record.lastError = new Error(String(reason || "network_failure"));
      invalidated = true;
      if (record.demand && !record.disposed && online) {
        if (immediate) {
          clearRetry(record);
          record.status = "queued";
        } else {
          scheduleBackoff(record);
        }
      } else {
        record.status = record.disposed ? "disposed" : "parked";
      }
    }
    if (invalidated) {
      reconcile();
    }
    return invalidated;
  };

  const unregister = (session, reason = "session_closed") => {
    const record = records.get(session);
    if (!record) {
      return false;
    }
    record.disposed = true;
    record.demand = null;
    clearRetry(record);
    if (record.lease) {
      requestDisconnect(record, reason);
    } else {
      records.delete(session);
      emit();
    }
    reconcile();
    return true;
  };

  const confirmUnregistered = (session) => {
    const record = records.get(session);
    if (!record || !record.disposed || record.lease) {
      return false;
    }
    records.delete(session);
    emit();
    return true;
  };

  const setOnline = (value) => {
    const nextOnline = value !== false;
    if (online === nextOnline) {
      return snapshot();
    }
    online = nextOnline;
    if (!online) {
      for (const record of records.values()) {
        clearRetry(record);
      }
    }
    return reconcile();
  };

  const setGeneration = (generation) => {
    currentGeneration = Number(generation) || 0;
    return reconcile();
  };

  const setCapacity = (value) => {
    const nextCapacity = normalizeCapacity(value);
    if (safeCapacity === nextCapacity) {
      return snapshot();
    }
    safeCapacity = nextCapacity;
    return reconcile();
  };

  const currentLease = (session) => {
    const lease = records.get(session)?.lease;
    return lease ? { ...lease } : null;
  };

  return {
    register,
    unregister,
    confirmUnregistered,
    request,
    updatePriority,
    release,
    reconcile,
    setOnline,
    setGeneration,
    setCapacity,
    notifyConnecting,
    notifyOpen,
    notifyReplayReady,
    notifyFailure,
    notifyClosed,
    invalidateTransport,
    currentLease,
    snapshot,
  };
};
