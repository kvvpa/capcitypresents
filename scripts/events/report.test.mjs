import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPdf } from '../../netlify/functions/_shared/report-pdf.mjs';

test('creates a readable PDF review report', async () => {
  const bytes = await createReviewPdf({
    reviewer: 'Joey',
    startedAt: '2026-06-19T20:00:00Z',
    completedAt: '2026-06-19T21:00:00Z',
    baselineSha: '1234567890',
    headSha: 'abcdef1234',
    beforeChanges: [],
    startFlags: [],
    manualChanges: [],
    automatedDuringReview: [],
    remainingFlags: [],
    summary: { beforeCount: 0, manualCount: 0, remainingFlags: 0 },
  });
  assert.ok(bytes.length > 700);
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString('ascii'), '%PDF');
});
