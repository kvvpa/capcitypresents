import test from 'node:test';
import assert from 'node:assert/strict';
import { flagKey, classifyFlags, advanceTrackedAfterReview } from './flag-lifecycle.mjs';

test('flagKey is stable across wording/value changes', () => {
  const a = { eventKey: 'e1', field: 'doorsTime', label: 'door time', message: '8 vs 9' };
  const b = { eventKey: 'e1', field: 'doorsTime', label: 'door time', message: '7 vs 9' };
  assert.equal(flagKey(a), flagKey(b));
});

test('classifies new, standing, and self-corrected (completed) flags', () => {
  const liveFlags = [
    { eventKey: 'e1', field: 'doorsTime', label: 'door time', message: 'conflict A' },
    { eventKey: 'e2', field: 'poster', label: 'poster', message: 'image 403' },
  ];
  const tracked = {
    'e2::poster::poster': {
      acknowledgedAt: '2026-06-01T00:00:00Z',
      reviewsSpanned: 1,
      snapshot: { eventKey: 'e2', field: 'poster', label: 'poster', title: 'Show 2', message: 'image 403' },
    },
    'e3::doorsTime::door time': {
      acknowledgedAt: '2026-05-01T00:00:00Z',
      reviewsSpanned: 2,
      snapshot: { eventKey: 'e3', field: 'doorsTime', label: 'door time', title: 'Show 3', message: 'old conflict' },
    },
  };

  const { newFlags, standing, completed } = classifyFlags({ liveFlags, tracked, wontFix: {} });
  assert.deepEqual(newFlags.map((f) => f.eventKey), ['e1']);   // live + unacknowledged
  assert.deepEqual(standing.map((f) => f.eventKey), ['e2']);   // acknowledged + still emitted
  assert.equal(standing[0].reviewsSpanned, 1);
  assert.deepEqual(completed.map((f) => f.eventKey), ['e3']);  // acknowledged + gone = resolved
});

test("won't-fix flags are hidden from every bucket", () => {
  const liveFlags = [{ eventKey: 'e1', field: 'poster', label: 'poster', message: 'no flyer' }];
  const wontFix = { 'e1::poster::poster': { dismissedAt: 'x', snapshot: {} } };
  const { newFlags, standing, completed } = classifyFlags({ liveFlags, tracked: {}, wontFix });
  assert.equal(newFlags.length + standing.length + completed.length, 0);
});

test('export advances standing reviewsSpanned and retires resolved flags', () => {
  const tracked = {
    'e2::poster::poster': { acknowledgedAt: 'a', reviewsSpanned: 0, snapshot: {} },        // still live -> ++
    'e3::doorsTime::door time': { acknowledgedAt: 'b', reviewsSpanned: 1, snapshot: {} },   // gone -> retire
  };
  const liveFlags = [{ eventKey: 'e2', field: 'poster', label: 'poster' }];
  const next = advanceTrackedAfterReview({ tracked, liveFlags });
  assert.deepEqual(Object.keys(next), ['e2::poster::poster']);
  assert.equal(next['e2::poster::poster'].reviewsSpanned, 1);
});
