/**
 * Pure timed-effects queue math (world time in Foundry seconds).
 * No Foundry imports — unit-tested.
 */

/**
 * @typedef {object} TimedEffect
 * @property {string} id
 * @property {string} type - e.g. toxinOnset | toxinRetest | drugExpire | custom
 * @property {string} [actorUuid]
 * @property {number} fireAt - absolute world time (seconds) when effect fires
 * @property {object} [payload]
 * @property {string} [label]
 */

/**
 * @param {Partial<TimedEffect> & { type: string, fireAt: number }} data
 * @returns {TimedEffect}
 */
export function createTimedEffect(data) {
  return {
    id: data.id || randomId(),
    type: data.type,
    actorUuid: data.actorUuid ?? null,
    fireAt: Number(data.fireAt) || 0,
    payload: data.payload ?? {},
    label: data.label ?? data.type
  };
}

/** Deterministic-enough id for tests; live code uses the VTT's randomID helper. */
function randomId() {
  return `te-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Split due vs remaining effects at world time `now`.
 * @param {TimedEffect[]} queue
 * @param {number} now
 * @returns {{ due: TimedEffect[], remaining: TimedEffect[] }}
 */
export function partitionDue(queue, now) {
  const t = Number(now) || 0;
  const due = [];
  const remaining = [];
  for (const e of queue ?? []) {
    if ((Number(e.fireAt) || 0) <= t) due.push(e);
    else remaining.push(e);
  }
  // Process earlier first
  due.sort((a, b) => (a.fireAt - b.fireAt) || String(a.id).localeCompare(String(b.id)));
  return { due, remaining };
}

/**
 * Schedule toxin workflow:
 *  - onset at now + onsetSeconds (ingestion ~600s = 10 min)
 *  - optional retests every intervalSeconds while Sick
 *  - natural end at now + durationSeconds (or onset + duration)
 *
 * @param {object} opts
 * @param {string} opts.actorUuid
 * @param {string} opts.toxinName
 * @param {number} opts.power - resistance threshold
 * @param {number} [opts.now]
 * @param {number} [opts.onsetSeconds] - default 0 (injection/inhalation immediate)
 * @param {number} [opts.intervalSeconds] - re-test cadence; 0 = no retest schedule
 * @param {number} [opts.durationSeconds] - natural Sick duration from onset
 * @param {string} [opts.delivery] - ingestion | inhalation | injection
 * @returns {TimedEffect[]}
 */
export function scheduleToxinExposure({
  actorUuid,
  toxinName,
  power,
  now = 0,
  onsetSeconds = 0,
  intervalSeconds = 0,
  durationSeconds = 3600,
  delivery = "injection"
} = {}) {
  const t0 = Number(now) || 0;
  const onsetAt = t0 + Math.max(0, Number(onsetSeconds) || 0);
  const effects = [];

  effects.push(createTimedEffect({
    type: "toxinOnset",
    actorUuid,
    fireAt: onsetAt,
    label: `${toxinName} onset`,
    payload: {
      toxinName,
      power: Number(power) || 1,
      delivery,
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      intervalSeconds: Math.max(0, Number(intervalSeconds) || 0)
    }
  }));

  if (durationSeconds > 0) {
    effects.push(createTimedEffect({
      type: "toxinExpire",
      actorUuid,
      fireAt: onsetAt + Math.max(0, Number(durationSeconds) || 0),
      label: `${toxinName} expires`,
      payload: { toxinName }
    }));
  }

  // First retest scheduled at onset+interval (further retests re-queued on fire)
  if (intervalSeconds > 0) {
    effects.push(createTimedEffect({
      type: "toxinRetest",
      actorUuid,
      fireAt: onsetAt + intervalSeconds,
      label: `${toxinName} retest`,
      payload: {
        toxinName,
        power: Number(power) || 1,
        intervalSeconds,
        expireAt: onsetAt + Math.max(0, Number(durationSeconds) || 0)
      }
    }));
  }

  return effects;
}

/**
 * Append effects to a queue (immutable).
 * @param {TimedEffect[]} queue
 * @param {TimedEffect[]} additions
 */
export function enqueueTimed(queue, additions) {
  return [...(queue ?? []), ...(additions ?? [])];
}

/**
 * Remove effects by id.
 * @param {TimedEffect[]} queue
 * @param {string|string[]} ids
 */
export function removeTimed(queue, ids) {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  return (queue ?? []).filter((e) => !set.has(e.id));
}

/**
 * Default onset delay by delivery method (seconds).
 * Ingestion ~10 min; disease 12–72 h left to caller; injection/inhalation 0.
 */
export function defaultOnsetSeconds(delivery = "injection") {
  switch (String(delivery).toLowerCase()) {
    case "ingestion":
      return 600;
    case "disease":
      return 12 * 3600;
    default:
      return 0;
  }
}
