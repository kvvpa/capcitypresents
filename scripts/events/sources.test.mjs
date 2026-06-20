import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchPurplepassEvents,
  inferFacebookPostEventDate,
  inferFacebookPostLocation,
  isFacebookEventEligible,
} from './sources.mjs';

test('uses the configured Purplepass feed proxy', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://capcitypresents.com/api/purplepass-feed');
    return new Response(JSON.stringify({
      events: [{ source: 'purplepass', sourceId: '379058', title: 'Holy Locust' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const events = await fetchPurplepassEvents({
      feedUrl: 'https://capcitypresents.com/api/purplepass-feed',
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
