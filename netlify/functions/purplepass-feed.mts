import type { Config } from '@netlify/functions';
import { fetchPurplepassEvents } from '../../scripts/events/sources.mjs';

const ORGANIZER_ID = '42425';

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=3600',
  },
});

export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  try {
    const origin = new URL(request.url).origin;
    const events = await fetchPurplepassEvents({ organizerId: ORGANIZER_ID, feedUrl: '' });
    return json({
      generatedAt: new Date().toISOString(),
      events: events.map((event) => ({
        ...event,
        images: event.images?.length
          ? [{
              ...event.images[0],
              remoteUrl: `${origin}/api/purplepass-image/${event.sourceId}`,
            }]
          : [],
      })),
    });
  } catch (error: any) {
    console.error('[purplepass-feed] failed', error);
    return json({ error: error.message || 'Purplepass feed failed.' }, 502);
  }
};

export const config: Config = {
  path: '/api/purplepass-feed',
  method: ['GET'],
};
