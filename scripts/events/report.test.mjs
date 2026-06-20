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
    manualChanges: [],
    automatedDuringReview: [],
    newFlags: [
      { title: 'Holy Locust', label: 'door time', field: 'doorsTime', message: 'Facebook says 8 PM; Purplepass says 9 PM.' },
    ],
    standingFlags: [
      { title: 'MaRaK', label: 'poster', field: 'poster', message: 'Image returned 403.', acknowledgedAt: '2026-06-05T00:00:00Z', reviewsSpanned: 2 },
    ],
    completedFlags: [
      { title: 'Calder Allen', label: 'poster', field: 'poster', message: 'Image returned 403.', acknowledgedAt: '2026-05-20T00:00:00Z', reviewsSpanned: 1 },
    ],
    summary: { beforeCount: 0, manualCount: 0, newCount: 1, standingCount: 1, completedCount: 1 },
  });
  assert.ok(bytes.length > 700);
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString('ascii'), '%PDF');
});
