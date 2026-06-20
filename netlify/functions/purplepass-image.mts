import type { Config, Context } from '@netlify/functions';

const ORGANIZER_ID = '42425';

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export default async (request: Request, context: Context) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const eventId = String(context.params.eventId || '');
  if (!/^\d+$/.test(eventId)) return json({ error: 'Invalid event ID.' }, 400);

  try {
    const detailResponse = await fetch(`https://www.purplepass.com/v2/events/${eventId}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CapCityPresents/1.0; +https://capcitypresents.com)',
      },
    });
    if (!detailResponse.ok) throw new Error(`Purplepass event ${eventId} returned ${detailResponse.status}`);
    const detail = await detailResponse.json();
    const event = detail?.event;
    if (!event || String(event.userId || '') !== ORGANIZER_ID) {
      return json({ error: 'Event does not belong to CapCity Presents.' }, 404);
    }

    const imagePath = event.imgUrl || event.eventBackgroundImage || '';
    if (!imagePath) return json({ error: 'Event image not found.' }, 404);
    const imageUrl = new URL(imagePath, 'https://www.purplepass.com').toString();
    const imageResponse = await fetch(imageUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
        Referer: `https://www.purplepass.com/events/${event.slug || eventId}`,
        'User-Agent': 'Mozilla/5.0 (compatible; CapCityPresents/1.0; +https://capcitypresents.com)',
      },
    });
    if (!imageResponse.ok) throw new Error(`Purplepass image ${eventId} returned ${imageResponse.status}`);

    return new Response(await imageResponse.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/webp',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: any) {
    console.error('[purplepass-image] failed', { eventId, error });
    return json({ error: error.message || 'Purplepass image failed.' }, 502);
  }
};

export const config: Config = {
  path: '/api/purplepass-image/:eventId',
  method: ['GET'],
};
