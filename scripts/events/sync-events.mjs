import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachFacebookToPurplepass, fetchFacebookEvents, fetchPurplepassEvents } from './sources.mjs';
import { materializeEventImages } from './images.mjs';
import { mergeEvent } from './merge.mjs';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import {
  cleanText,
  hashBuffer,
  parseFacebookEventId,
  parsePurplepassId,
  slugify,
  titleSimilarity,
  valuesEqual,
} from './utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const contentDir = path.join(rootDir, 'src/content/events');
const publicDir = path.join(rootDir, 'public');
const statePath = path.join(rootDir, 'event-sync/state.json');
const dryRun = process.argv.includes('--dry-run');
const trigger = process.env.EVENT_SYNC_TRIGGER || (dryRun ? 'dry-run' : 'local');

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cleanText(value);
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter((item) => item !== undefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([key, item]) => [key, cleanObject(item)]),
    );
  }
  return value;
}

function stable(value) {
  const sortValue = (item) => {
    if (Array.isArray(item)) return item.map(sortValue);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sortValue(item[key])]));
    }
    return item;
  };
  return JSON.stringify(sortValue(cleanObject(value)));
}

async function loadExistingEvents() {
  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith('.md'));
  return Promise.all(files.map(async (fileName) => {
    const filePath = path.join(contentDir, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(raw);
    parsed.data.date = normalizeDate(parsed.data.date);
    return {
      fileName,
      filePath,
      raw,
      data: parsed.data,
      body: cleanText(parsed.content),
      purplepassId: parsePurplepassId(`${parsed.data.ticketUrl || ''}\n${parsed.data.poster || ''}`),
      facebookEventId: parseFacebookEventId(parsed.data.facebookEventUrl || ''),
    };
  }));
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    return { version: 1, events: {}, flags: [] };
  }
}

function matchExisting(existingEvents, purplepass, facebook, claimed) {
  const eventKey = purplepass ? `purplepass:${purplepass.sourceId}` : `facebook:${facebook.sourceId}`;
  let match = existingEvents.find((event) => !claimed.has(event.fileName) && event.data.syncId === eventKey);
  if (!match && purplepass) {
    match = existingEvents.find((event) => !claimed.has(event.fileName) && event.purplepassId === purplepass.sourceId);
  }
  if (!match && facebook?.facebookEventUrl) {
    const facebookEventId = parseFacebookEventId(facebook.facebookEventUrl);
    match = existingEvents.find((event) => !claimed.has(event.fileName) && event.facebookEventId && event.facebookEventId === facebookEventId);
  }
  if (!match) {
    const source = purplepass || facebook;
    match = existingEvents
      .filter((event) => !claimed.has(event.fileName) && event.data.date === source.date)
      .sort((a, b) => titleSimilarity(b.data.title, source.title) - titleSimilarity(a.data.title, source.title))
      .find((event) => titleSimilarity(event.data.title, source.title) >= 0.42);
  }
  return { eventKey, match: match || null };
}

function eventFileName(date, title) {
  return `${date}-${slugify(title)}.md`;
}

function serializeEvent(data, body) {
  const ordered = cleanObject({
    title: data.title,
    date: normalizeDate(data.date),
    ...(data.doorsTime ? { doorsTime: data.doorsTime } : {}),
    ...(data.showTime ? { showTime: data.showTime } : {}),
    venue: data.venue || 'Venue TBA',
    city: data.city || 'Olympia, WA',
    ...(data.ageRestriction ? { ageRestriction: data.ageRestriction } : {}),
    ...(data.price ? { price: data.price } : {}),
    ...(data.ticketUrl ? { ticketUrl: data.ticketUrl } : {}),
    ...(data.facebookEventUrl ? { facebookEventUrl: data.facebookEventUrl } : {}),
    ...(data.poster ? { poster: data.poster } : {}),
    ...(data.posterSource ? { posterSource: data.posterSource } : {}),
    ...(data.alternateImages?.length ? { alternateImages: data.alternateImages } : {}),
    imageLocked: Boolean(data.imageLocked),
    lockedFields: data.lockedFields || [],
    syncId: data.syncId,
    status: data.status || 'announced',
    featured: Boolean(data.featured),
  });
  return stringifyFrontmatter(`${cleanText(body)}\n`, ordered);
}

function diffEvent(before, after) {
  const fields = [
    'title', 'date', 'doorsTime', 'showTime', 'venue', 'city', 'ageRestriction', 'price',
    'ticketUrl', 'facebookEventUrl', 'poster', 'posterSource', 'alternateImages',
    'imageLocked', 'lockedFields', 'status', 'featured', 'description',
  ];
  const previous = { ...(before?.data || {}), description: before?.body || '' };
  const next = { ...after.data, description: after.body || '' };
  return fields
    .filter((field) => stable(previous[field]) !== stable(next[field]))
    .map((field) => ({ field, before: previous[field] ?? '', after: next[field] ?? '' }));
}

function hasDifferentSourceImages(candidates) {
  const sources = new Set(candidates.map((candidate) => candidate.source));
  return sources.has('purplepass') && sources.has('facebook');
}

async function main() {
  const [existingEvents, previousState] = await Promise.all([
    loadExistingEvents(),
    loadState(),
  ]);
  const [purplepassResult, facebookSettled] = await Promise.allSettled([
    fetchPurplepassEvents({ organizerId: process.env.PURPLEPASS_ORGANIZER_ID || '42425' }),
    fetchFacebookEvents(),
  ]);
  const purplepassEvents = purplepassResult.status === 'fulfilled' ? purplepassResult.value : [];
  const facebookResult = facebookSettled.status === 'fulfilled'
    ? facebookSettled.value
    : { events: [], warning: `Facebook source failed: ${facebookSettled.reason?.message || 'Unknown error'}` };
  const sourceWarnings = [
    ...(purplepassResult.status === 'rejected'
      ? [`Purplepass source failed: ${purplepassResult.reason?.message || 'Unknown error'}`]
      : []),
    facebookResult.warning,
  ].filter(Boolean);

  const bundles = attachFacebookToPurplepass(purplepassEvents, facebookResult.events);
  const claimed = new Set();
  const changes = [];
  const flags = sourceWarnings.map((warning) => ({
    eventKey: warning.startsWith('Purplepass') ? 'source:purplepass' : 'source:facebook',
    title: 'Event sync source',
    field: 'source',
    label: 'source connection',
    severity: 'warning',
    message: warning,
    chosen: { source: 'existing', value: 'Existing website data retained.' },
    candidates: [],
  }));
  const nextEventsState = { ...(previousState.events || {}) };

  for (const bundle of bundles) {
    const source = bundle.purplepass || bundle.facebook;
    if (!source?.date || !source?.title) continue;
    const eventDate = new Date(`${source.date}T23:59:59-07:00`);
    if (!bundle.purplepass && eventDate < new Date()) continue;

    const { eventKey, match } = matchExisting(existingEvents, bundle.purplepass, bundle.facebook, claimed);
    if (match) claimed.add(match.fileName);
    const previousEventState = previousState.events?.[eventKey];
    const merged = mergeEvent({
      eventKey,
      existing: match,
      purplepass: bundle.purplepass,
      facebook: bundle.facebook,
      previousState: previousEventState,
    });

    const currentPoster = match?.data.poster || '';
    const previousPoster = previousEventState?.lastPublished?.poster;
    const manualPosterDetected = Boolean(
      currentPoster &&
      currentPoster !== '/assets/default-poster.png' &&
      (
        (previousPoster && !valuesEqual(currentPoster, previousPoster)) ||
        (!previousPoster && currentPoster.startsWith('/uploads/') && !currentPoster.startsWith('/uploads/synced/'))
      )
    );

    const images = await materializeEventImages({
      eventKey,
      existingPoster: currentPoster,
      existingPosterSource: match?.data.posterSource,
      existingAlternates: match?.data.alternateImages || [],
      imageLocked: Boolean(match?.data.imageLocked),
      manualPosterDetected,
      sourceImages: merged.sourceImages,
      publicDir,
      dryRun,
    });

    merged.data.poster = images.poster || undefined;
    merged.data.posterSource = images.posterSource;
    merged.data.alternateImages = images.alternateImages;
    flags.push(...merged.flags);

    if (hasDifferentSourceImages(images.candidates)) {
      flags.push({
        eventKey,
        title: merged.data.title,
        field: 'poster',
        label: 'poster',
        severity: 'info',
        message: `${images.posterSource} image was selected; an alternate platform image is available.`,
        chosen: { source: images.posterSource, value: images.poster },
        candidates: images.candidates,
      });
    }
    for (const warning of images.warnings) {
      flags.push({
        eventKey,
        title: merged.data.title,
        field: 'poster',
        label: 'poster',
        severity: 'warning',
        message: warning,
        chosen: { source: images.posterSource, value: images.poster },
        candidates: images.candidates,
      });
    }

    const fileName = match?.fileName || eventFileName(merged.data.date, merged.data.title);
    const filePath = path.join(contentDir, fileName);
    const nextEvent = { data: merged.data, body: merged.body };
    const eventChanges = diffEvent(match, nextEvent);
    if (eventChanges.length) {
      changes.push({
        eventKey,
        file: `src/content/events/${fileName}`,
        title: merged.data.title,
        created: !match,
        fields: eventChanges,
      });
      if (!dryRun) await fs.writeFile(filePath, serializeEvent(merged.data, merged.body), 'utf8');
    }

    nextEventsState[eventKey] = {
      file: `src/content/events/${fileName}`,
      sourceIds: merged.sourceIds,
      sourceUrls: merged.sourceUrls,
      fieldSources: merged.fieldSources,
      manualFields: merged.manualFields,
      lastPublished: cleanObject({
        ...merged.data,
        description: merged.body,
      }),
      lastSeenAt: new Date().toISOString(),
    };
  }

  const nextState = {
    version: 1,
    lastRun: {
      at: new Date().toISOString(),
      trigger,
      purplepassEvents: purplepassEvents.length,
      facebookEvents: facebookResult.events.length,
      facebookConfigured: !facebookResult.warning,
      warnings: sourceWarnings,
      changedEvents: changes.length,
    },
    events: nextEventsState,
    flags: flags.map((flag) => ({
      ...flag,
      id: hashBuffer(Buffer.from(JSON.stringify({
        eventKey: flag.eventKey,
        field: flag.field,
        message: flag.message,
        candidates: flag.candidates,
      })), 14),
    })),
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    dryRun,
    purplepassEvents: purplepassEvents.length,
    facebookEvents: facebookResult.events.length,
    changedEvents: changes.length,
    flags: nextState.flags.length,
    flagDetails: nextState.flags,
    warning: facebookResult.warning,
    sourceWarnings,
    changes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
