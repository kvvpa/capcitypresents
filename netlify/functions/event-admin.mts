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
import { advanceTrackedAfterReview, classifyFlags, flagKey, flagSnapshot } from '../../scripts/events/flag-lifecycle.mjs';
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

    const loadTracked = async () => (await store.get('flags/tracked', { type: 'json' }) as Record<string, any>) || {};
    const loadWontFix = async () => (await store.get('flags/wont-fix', { type: 'json' }) as Record<string, any>) || {};
    const readFlag = async () => {
      const payload = await request.json().catch(() => ({})) as Record<string, any>;
      const flag = payload.flag || payload;
      if (!flag || !(flag.eventKey || flag.key)) throw Object.assign(new Error('A flag is required.'), { status: 400 });
      return flag;
    };

    if (request.method === 'GET' && action === 'status') {
      const [headSha, sync, state, review, tracked, wontFix] = await Promise.all([
        getHeadSha(),
        getLatestSyncRun(),
        getCurrentSyncState(),
        store.get('review/current', { type: 'json' }),
        loadTracked(),
        loadWontFix(),
      ]);
      const { newFlags, standing, completed } = classifyFlags({ liveFlags: state.flags || [], tracked, wontFix });
      return json({
        user,
        headSha,
        sync,
        review,
        lastRun: state.lastRun || null,
        flags: { new: newFlags, standing, completed },
        wontFix: Object.entries(wontFix).map(([key, meta]: [string, any]) => ({ key, ...meta.snapshot, dismissedAt: meta.dismissedAt })),
        flagCounts: {
          new: newFlags.length,
          standing: standing.length,
          completed: completed.length,
          wontFix: Object.keys(wontFix).length,
        },
      });
    }

    if (request.method === 'POST' && action === 'sync') {
      await dispatchSync(user.name);
      return json({ ok: true, message: 'Event sync requested. It should begin within a minute.' }, 202);
    }

    if (request.method === 'POST' && action === 'acknowledge-flag') {
      const flag = await readFlag();
      const key = flag.key || flagKey(flag);
      const [tracked, wontFix] = await Promise.all([loadTracked(), loadWontFix()]);
      tracked[key] = {
        acknowledgedAt: tracked[key]?.acknowledgedAt || new Date().toISOString(),
        reviewsSpanned: tracked[key]?.reviewsSpanned || 0,
        reviewer: user.name,
        reviewerEmail: user.email,
        snapshot: flagSnapshot(flag),
      };
      delete wontFix[key];
      await Promise.all([store.setJSON('flags/tracked', tracked), store.setJSON('flags/wont-fix', wontFix)]);
      return json({ ok: true });
    }

    if (request.method === 'POST' && action === 'wont-fix-flag') {
      const flag = await readFlag();
      const key = flag.key || flagKey(flag);
      const [tracked, wontFix] = await Promise.all([loadTracked(), loadWontFix()]);
      wontFix[key] = {
        dismissedAt: new Date().toISOString(),
        reviewer: user.name,
        reviewerEmail: user.email,
        snapshot: flagSnapshot(flag),
      };
      delete tracked[key];
      await Promise.all([store.setJSON('flags/tracked', tracked), store.setJSON('flags/wont-fix', wontFix)]);
      return json({ ok: true });
    }

    if (request.method === 'POST' && action === 'reset-flag') {
      const flag = await readFlag();
      const key = flag.key || flagKey(flag);
      const [tracked, wontFix] = await Promise.all([loadTracked(), loadWontFix()]);
      delete tracked[key];
      delete wontFix[key];
      await Promise.all([store.setJSON('flags/tracked', tracked), store.setJSON('flags/wont-fix', wontFix)]);
      return json({ ok: true });
    }

    if (request.method === 'POST' && action === 'begin-review') {
      const active = await store.get('review/current', { type: 'json' }) as Record<string, unknown> | null;
      if (active) return json({ ok: true, review: active, resumed: true });

      const [headSha, lastReview] = await Promise.all([
        getHeadSha(),
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
      };
      await store.setJSON('review/current', review);
      return json({ ok: true, review, resumed: false });
    }

    if (request.method === 'POST' && action === 'export-review') {
      const review = await store.get('review/current', { type: 'json' }) as Record<string, any> | null;
      if (!review) return json({ error: 'Begin a weekly review before exporting the report.' }, 409);

      const completedAt = new Date().toISOString();
      const [headSha, state, changes, tracked, wontFix] = await Promise.all([
        getHeadSha(),
        getCurrentSyncState(),
        collectEventChanges(review.periodStart, completedAt),
        loadTracked(),
        loadWontFix(),
      ]);
      const liveFlags = state.flags || [];
      const { newFlags, standing, completed } = classifyFlags({ liveFlags, tracked, wontFix });

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
        manualChanges,
        automatedDuringReview,
        newFlags,
        standingFlags: standing,
        completedFlags: completed,
        summary: {
          beforeCount: beforeChanges.length,
          manualCount: manualChanges.length,
          newCount: newFlags.length,
          standingCount: standing.length,
          completedCount: completed.length,
        },
      };
      const bytes = await createReviewPdf(report);

      // Self-corrected (completed) flags retire; still-emitted standing flags age up.
      await store.setJSON('flags/tracked', advanceTrackedAfterReview({ tracked, liveFlags }));
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
