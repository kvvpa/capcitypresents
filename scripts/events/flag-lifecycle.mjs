// Flag lifecycle shared by the admin function and its tests.
//
// A flag's identity for lifecycle purposes is its *location* (event + field +
// label), not its exact wording — so a lingering conflict keeps accruing age
// even if the specific values shift, instead of resetting to "new".
//
// Buckets:
//   new       - live flag the reviewer has not acknowledged
//   standing  - acknowledged, but the sync STILL emits it (unresolved; ages)
//   completed - was acknowledged, now absent from the sync (self-corrected)
//   (won't-fix entries are hidden from every bucket)

export function flagKey(flag) {
  return [flag.eventKey || '', flag.field || '', flag.label || ''].join('::');
}

// Compact display info remembered so a self-corrected (now-absent) flag can
// still be rendered as "resolved".
export function flagSnapshot(flag) {
  return {
    eventKey: flag.eventKey || '',
    field: flag.field || '',
    label: flag.label || '',
    title: flag.title || '',
    message: flag.message || '',
    severity: flag.severity || 'info',
    chosen: flag.chosen || null,
  };
}

export function classifyFlags({ liveFlags = [], tracked = {}, wontFix = {} } = {}) {
  const newFlags = [];
  const standing = [];
  const liveKeys = new Set();

  for (const flag of liveFlags) {
    const key = flagKey(flag);
    liveKeys.add(key);
    if (wontFix[key]) continue;
    const meta = tracked[key];
    if (meta) {
      standing.push({ ...flag, key, acknowledgedAt: meta.acknowledgedAt, reviewsSpanned: meta.reviewsSpanned || 0 });
    } else {
      newFlags.push({ ...flag, key });
    }
  }

  // Acknowledged issues the sync no longer emits = resolved at the source.
  const completed = Object.entries(tracked)
    .filter(([key]) => !liveKeys.has(key))
    .map(([key, meta]) => ({
      ...meta.snapshot,
      key,
      acknowledgedAt: meta.acknowledgedAt,
      reviewsSpanned: meta.reviewsSpanned || 0,
    }));

  return { newFlags, standing, completed };
}

// At review export: still-emitted acknowledged flags survive another review
// (++reviewsSpanned); self-corrected ones retire (dropped). Returns next map.
export function advanceTrackedAfterReview({ tracked = {}, liveFlags = [] } = {}) {
  const liveKeys = new Set(liveFlags.map(flagKey));
  const next = {};
  for (const [key, meta] of Object.entries(tracked)) {
    if (liveKeys.has(key)) {
      next[key] = { ...meta, reviewsSpanned: (meta.reviewsSpanned || 0) + 1 };
    }
  }
  return next;
}
