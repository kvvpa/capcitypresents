import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvent } from './merge.mjs';

function merge({ existing = {}, purplepass = {}, facebook = {}, previousState } = {}) {
  return mergeEvent({
    eventKey: 'purplepass:123',
    existing: {
      data: {
        title: 'Example Show',
        date: '2026-08-15',
        showTime: '7:00 PM',
        venue: 'Wild Child',
        city: 'Olympia, WA',
        status: 'announced',
        featured: false,
        lockedFields: [],
        ...existing,
      },
      body: '',
    },
    purplepass: purplepass === null ? null : {
      source: 'purplepass',
      title: 'Example Show',
      date: '2026-08-15',
      showTime: '7:00 PM',
      venue: 'Wild Child',
      city: 'Olympia, WA',
      status: 'announced',
      evidence: { date: 'ticket-page', showTime: 'ticket-page' },
      ...purplepass,
    },
    facebook: facebook === null ? null : {
      source: 'facebook',
      title: 'Example Show',
      date: '2026-08-15',
      showTime: '7:00 PM',
      venue: 'Wild Child',
      city: 'Olympia, WA',
      status: 'announced',
      evidence: { date: 'post-text', showTime: 'post-text' },
      ...facebook,
    },
    previousState,
  });
}

test('publishes the credible PM time and flags the Facebook AM conflict', () => {
  const result = merge({ facebook: { showTime: '7:00 AM' } });
  assert.equal(result.data.showTime, '7:00 PM');
  assert.ok(result.flags.some((flag) => flag.field === 'showTime'));
});

test('treats an unsupported December 31 Facebook date as suspicious', () => {
  const result = merge({
    existing: { date: '2026-07-13' },
    purplepass: { date: '2026-07-13' },
    facebook: { date: '2026-12-31', evidence: { date: 'post-text' } },
  });
  assert.equal(result.data.date, '2026-07-13');
  assert.ok(result.flags.some((flag) => /December 31/.test(flag.message)));
});

test('preserves a manual field edit made after the previous sync', () => {
  const result = merge({
    existing: { venue: 'The Real Venue' },
    purplepass: { venue: 'Wild Child' },
    previousState: {
      lastPublished: {
        venue: 'Old Venue',
      },
    },
  });
  assert.equal(result.data.venue, 'The Real Venue');
  assert.ok(result.manualFields.includes('venue'));
});

test('preserves an explicitly locked field', () => {
  const result = merge({
    existing: { title: 'Joey Approved Title', lockedFields: ['title'] },
    purplepass: { title: 'Different Ticketing Title' },
  });
  assert.equal(result.data.title, 'Joey Approved Title');
});

test('replaces a placeholder venue with a sourced venue', () => {
  const result = merge({
    existing: { venue: 'Venue TBA' },
    purplepass: null,
    facebook: { venue: 'Olympia Lamplighters' },
  });
  assert.equal(result.data.venue, 'Olympia Lamplighters');
});

test('uses an explicitly named Facebook venue and city for a tour stop', () => {
  const result = merge({
    existing: { venue: 'Venue TBA', city: 'Olympia, WA' },
    purplepass: null,
    facebook: {
      venue: 'Jazzbones',
      city: 'Tacoma, WA',
      evidence: {
        venue: 'post-text-explicit',
        city: 'post-text-explicit',
      },
    },
  });
  assert.equal(result.data.venue, 'Jazzbones');
  assert.equal(result.data.city, 'Tacoma, WA');
});
