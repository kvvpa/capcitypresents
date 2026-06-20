import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { requireAdminUser } from './_shared/auth.mjs';
import {
  collectEventChanges,
  dispatchSync,
  getCurrentSyncState,
  getHeadSha,
  getLatestSyncRun,
} from './_shared/github.mjs';
import { createReviewPdf } from './_shared/report-pdf.mjs';

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

function reportFileName(date = new Date()) {
  const stamp = date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return `capcity-event-review-${stamp}.pdf`;
}

export default async (request: Request, context: Context) => {
  try {
    const user = await requireAdminUser(request);
    const action = context.params.action;
    const store = getStore({ name: 'event-review-sessions', consistency: 'strong' });
    const acknowledgements = await store.get('flags/acknowledged', { type: 'json' }) as Record<string, any> | null;
    const unresolvedFlags = (state: Record<string, any>) =>
      (state.flags || []).filter((flag: Record<string, any>) => !acknowledgements?.[flag.id]);

    if (request.method === 'GET' && action === 'status') {
      const [headSha, sync, state, review] = await Promise.all([
        getHeadSha(),
        getLatestSyncRun(),
        getCurrentSyncState(),
        store.get('review/current', { type: 'json' }),
      ]);
      return json({
        user,
        headSha,
        sync,
        review,
        lastRun: state.lastRun || null,
        flags: unresolvedFlags(state),
        reviewedFlagCount: (state.flags || []).length - unresolvedFlags(state).length,
      });
    }

    if (request.method === 'POST' && action === 'sync') {
      await dispatchSync(user.name);
      return json({ ok: true, message: 'Event sync requested. It should begin within a minute.' }, 202);
    }

    if (request.method === 'POST' && action === 'acknowledge-flag') {
      const payload = await request.json().catch(() => ({})) as Record<string, string>;
      if (!payload.id) return json({ error: 'Flag ID is required.' }, 400);
      const nextAcknowledgements = {
        ...(acknowledgements || {}),
        [payload.id]: {
          reviewedAt: new Date().toISOString(),
          reviewer: user.name,
          reviewerEmail: user.email,
        },
      };
      await store.setJSON('flags/acknowledged', nextAcknowledgements);
      return json({ ok: true });
    }

    if (request.method === 'POST' && action === 'begin-review') {
      const active = await store.get('review/current', { type: 'json' }) as Record<string, unknown> | null;
      if (active) return json({ ok: true, review: active, resumed: true });

      const [headSha, state, lastReview] = await Promise.all([
        getHeadSha(),
        getCurrentSyncState(),
        store.get('review/last', { type: 'json' }) as Promise<Record<string, unknown> | null>,
      ]);
      const startedAt = new Date().toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const review = {
        id: crypto.randomUUID(),
        startedAt,
        periodStart: lastReview?.completedAt || sevenDaysAgo,
        baselineSha: headSha,
        reviewer: user.name,
        reviewerEmail: user.email,
        startFlags: unresolvedFlags(state),
      };
      await store.setJSON('review/current', review);
      return json({ ok: true, review, resumed: false });
    }

    if (request.method === 'POST' && action === 'export-review') {
      const review = await store.get('review/current', { type: 'json' }) as Record<string, any> | null;
      if (!review) return json({ error: 'Begin a weekly review before exporting the report.' }, 409);

      const completedAt = new Date().toISOString();
      const [headSha, state, changes] = await Promise.all([
        getHeadSha(),
        getCurrentSyncState(),
        collectEventChanges(review.periodStart, completedAt),
      ]);

      const beforeChanges = changes.filter((change) => new Date(change.timestamp) < new Date(review.startedAt));
      const duringChanges = changes.filter((change) => new Date(change.timestamp) >= new Date(review.startedAt));
      const manualChanges = duringChanges.filter((change) => !change.automated);
      const automatedDuringReview = duringChanges.filter((change) => change.automated);
      const report = {
        reviewer: review.reviewer,
        reviewerEmail: review.reviewerEmail,
        startedAt: review.startedAt,
        completedAt,
        baselineSha: review.baselineSha,
        headSha,
        beforeChanges,
        startFlags: review.startFlags || [],
        manualChanges,
        automatedDuringReview,
        remainingFlags: unresolvedFlags(state),
        summary: {
          beforeCount: beforeChanges.length,
          manualCount: manualChanges.length,
          remainingFlags: unresolvedFlags(state).length,
        },
      };
      const bytes = await createReviewPdf(report);
      await store.setJSON('review/last', {
        id: review.id,
        startedAt: review.startedAt,
        completedAt,
        headSha,
        reviewer: review.reviewer,
      });
      await store.delete('review/current');

      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${reportFileName(new Date(completedAt))}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return json({ error: 'Unknown admin action.' }, 404);
  } catch (error: any) {
    console.error(error);
    return json({ error: error.message || 'Unexpected admin error.' }, error.status || 500);
  }
};

export const config: Config = {
  path: '/api/event-admin/:action',
  method: ['GET', 'POST'],
};
