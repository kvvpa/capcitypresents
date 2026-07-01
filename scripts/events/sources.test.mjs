import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchPurplepassEvents,
  inferFacebookPostEventDate,
  inferFacebookPostLocation,
  isFacebookEventEligible,
  parseEventAttachment,
  eventDetailsToFields,
} from './sources.mjs';
import { proxyPurplepass } from './utils.mjs';

test('routes Purplepass URLs through the proxy and leaves other hosts alone', () => {
  process.env.PURPLEPASS_PROXY_BASE = 'https://pp.example.workers.dev/';
  process.env.PURPLEPASS_PROXY_TOKEN = 'secret';
  try {
    const proxied = new URL(proxyPurplepass('https://www.purplepass.com/v2/organizer/42425'));
    assert.equal(proxied.origin, 'https://pp.example.workers.dev');
    assert.equal(proxied.searchParams.get('url'), 'https://www.purplepass.com/v2/organizer/42425');
    assert.equal(proxied.searchParams.get('token'), 'secret');
    // Non-Purplepass URLs (e.g. Facebook images) must not be proxied or tokenized.
    assert.equal(proxyPurplepass('https://graph.facebook.com/x'), 'https://graph.facebook.com/x');
  } finally {
    delete process.env.PURPLEPASS_PROXY_BASE;
    delete process.env.PURPLEPASS_PROXY_TOKEN;
  }
});

test('returns the original URL when no proxy is configured', () => {
  delete process.env.PURPLEPASS_PROXY_BASE;
  assert.equal(
    proxyPurplepass('https://www.purplepass.com/v2/organizer/42425'),
    'https://www.purplepass.com/v2/organizer/42425',
  );
});

test('uses an explicit pre-assembled feed when feedUrl is set', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://feed.example.com/events.json');
    return new Response(JSON.stringify({
      events: [{ source: 'purplepass', sourceId: '379058', title: 'Holy Locust' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const events = await fetchPurplepassEvents({
      feedUrl: 'https://feed.example.com/events.json',
    });
    assert.equal(events[0].sourceId, '379058');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the Facebook post year when an old event omits its year', () => {
  assert.equal(
    inferFacebookPostEventDate('Haywire at Olympia Lamplighters June 26th!', '2025-06-06T18:00:00+0000'),
    '2025-06-26',
  );
});

test('rolls a January event into the next year when announced in December', () => {
  assert.equal(
    inferFacebookPostEventDate('Tour stop January 9th!', '2025-12-10T18:00:00+0000'),
    '2026-01-09',
  );
});

test('keeps an explicit event year even when the post is older', () => {
  assert.equal(
    inferFacebookPostEventDate('Tour stop November 2, 2026!', '2025-08-01T18:00:00+0000'),
    '2026-11-02',
  );
});

test('extracts Olympia Lamplighters from a Facebook post', () => {
  const location = inferFacebookPostLocation(
    'HAYWIRE, DEATH BEFORE DISHONOR at Olympia Lamplighters June 26th! Get yours at https://haywireolympia.com',
  );
  assert.deepEqual(location, { venue: 'Olympia Lamplighters', city: 'Olympia, WA' });
});

test('combines a Tacoma event title with venue text from the post', () => {
  const location = inferFacebookPostLocation(
    "It's going down at Jazzbones on Sunday, November 2nd.\nTHOT SQUAD Tour at Jazzbones (Tacoma, WA)",
  );
  assert.deepEqual(location, { venue: 'Jazzbones', city: 'Tacoma, WA' });
  assert.equal(isFacebookEventEligible({
    title: 'Tacoma show',
    date: '2026-11-02',
    city: location.city,
    facebookEventUrl: 'https://www.facebook.com/events/123/',
  }), true);
});

test('allows a Purplepass-linked post even when location text is missing', () => {
  assert.equal(isFacebookEventEligible({
    title: 'Matched show',
    date: '2026-11-02',
    city: '',
    facebookEventUrl: 'https://www.facebook.com/events/123/',
    purplepassId: '456',
  }), true);
});

test('parseEventAttachment reads the event id from an event-type attachment', () => {
  const ref = parseEventAttachment([
    { media_type: 'event', title: 'Some Show', target: { id: '1234567890', url: 'https://www.facebook.com/events/1234567890/' } },
  ]);
  assert.equal(ref.eventId, '1234567890');
  assert.equal(ref.title, 'Some Show');
});

test('parseEventAttachment falls back to the event id embedded in a link', () => {
  const ref = parseEventAttachment([
    { media_type: 'share', url: 'https://www.facebook.com/events/987654321?ref=x' },
  ]);
  assert.equal(ref.eventId, '987654321');
});

test('parseEventAttachment ignores non-event attachments', () => {
  assert.equal(parseEventAttachment([{ media_type: 'photo', url: 'https://www.facebook.com/photo/?fbid=1' }]), null);
  assert.equal(parseEventAttachment([]), null);
});

test('eventDetailsToFields derives Pacific date, time, title and venue from an event', () => {
  const fields = eventDetailsToFields({
    id: '1234567890',
    name: 'Loud Night',
    start_time: '2026-08-15T20:00:00-0700',
    place: { name: 'Wild Child', location: { city: 'Olympia', state: 'WA' } },
  });
  assert.equal(fields.title, 'Loud Night');
  assert.equal(fields.date, '2026-08-15');
  assert.equal(fields.showTime, '8:00 PM');
  assert.equal(fields.venue, 'Wild Child');
  assert.equal(fields.city, 'Olympia, WA');
  assert.equal(fields.facebookEventUrl, 'https://www.facebook.com/events/1234567890');
});

test('eventDetailsToFields returns only what it can derive', () => {
  const fields = eventDetailsToFields({ id: '55', name: 'TBA Show' });
  assert.equal(fields.title, 'TBA Show');
  assert.equal(fields.date, undefined);
  assert.equal(fields.venue, undefined);
});
