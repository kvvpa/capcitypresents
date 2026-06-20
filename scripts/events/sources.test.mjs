import test from 'node:test';
import assert from 'node:assert/strict';
import { inferFacebookPostLocation, isFacebookEventEligible } from './sources.mjs';

test('extracts Olympia Lamplighters from a Facebook post', () => {
  const location = inferFacebookPostLocation(
    'HAYWIRE, DEATH BEFORE DISHONOR at Olympia Lamplighters June 26th!',
  );
  assert.deepEqual(location, { venue: 'Olympia Lamplighters', city: 'Olympia, WA' });
});

test('allows a Facebook Event in Tacoma and extracts its venue', () => {
  const location = inferFacebookPostLocation(
    "It's going down at Jazzbones on Sunday, November 2nd in Tacoma, WA.",
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
