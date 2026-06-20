import {
  cleanText,
  isLikelyDefaultDate,
  isLikelyMorningMistake,
  normalizeComparable,
  valuesEqual,
} from './utils.mjs';

const FIELD_SCORES = {
  title: { existing: 68, purplepass: 94, facebook: 78 },
  date: { existing: 70, purplepass: 98, facebook: 76 },
  doorsTime: { existing: 68, purplepass: 95, facebook: 72 },
  showTime: { existing: 68, purplepass: 97, facebook: 72 },
  venue: { existing: 72, purplepass: 92, facebook: 70 },
  city: { existing: 72, purplepass: 92, facebook: 68 },
  ageRestriction: { existing: 72, purplepass: 91, facebook: 70 },
  price: { existing: 70, purplepass: 94, facebook: 74 },
  ticketUrl: { existing: 70, purplepass: 100, facebook: 78 },
  facebookEventUrl: { existing: 78, purplepass: 72, facebook: 100 },
  status: { existing: 85, purplepass: 92, facebook: 80 },
};

const DISPLAY_NAMES = {
  title: 'title',
  date: 'date',
  doorsTime: 'doors time',
  showTime: 'show time',
  venue: 'venue',
  city: 'city',
  ageRestriction: 'age policy',
  price: 'price',
  ticketUrl: 'ticket URL',
  facebookEventUrl: 'Facebook URL',
  status: 'status',
  description: 'description',
  poster: 'poster',
};

function bodyQuality(value = '') {
  const text = cleanText(value);
  if (!text || /^(capcity presents[.:]?)$/i.test(text)) return 0;
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean).length;
  const links = (text.match(/https?:\/\//g) || []).length;
  const headings = (text.match(/^\*\*.+\*\*$/gm) || []).length;
  return Math.min(55, text.length / 80) + Math.min(12, paragraphs * 2) + Math.min(8, links * 2) + Math.min(10, headings * 2);
}

function candidateScore(field, source, value, evidence = '') {
  if (value === undefined || value === null || cleanText(value) === '') return -Infinity;
  let score = FIELD_SCORES[field]?.[source] ?? 60;
  if (source === 'existing' && /\b(tba|unknown|coming soon)\b/i.test(cleanText(value))) score -= 60;
  if (field === 'description') {
    score = { existing: 62, purplepass: 76, facebook: 72 }[source] + bodyQuality(value);
  }
  if (evidence === 'ticket-page') score += 4;
  if (evidence === 'post-text-explicit') score += field === 'venue' || field === 'city' ? 20 : 6;
  if ((field === 'doorsTime' || field === 'showTime') && isLikelyMorningMistake(value)) score -= 48;
  if (field === 'date' && isLikelyDefaultDate(value) && evidence !== 'post-text-explicit') score -= 38;
  if (field === 'status' && source === 'existing' && ['cancelled', 'sold-out'].includes(value)) score += 20;
  return score;
}

function manualDivergence(field, currentValue, previousPublished, lockedFields) {
  if (lockedFields.has(field)) return true;
  if (!previousPublished || !(field in previousPublished)) return false;
  return !valuesEqual(currentValue, previousPublished[field]);
}

function selectField({ field, currentValue, purplepass, facebook, previousPublished, lockedFields }) {
  const manual = manualDivergence(field, currentValue, previousPublished, lockedFields);
  const candidates = [
    { source: 'existing', value: currentValue, score: candidateScore(field, 'existing', currentValue) + (manual ? 80 : 0) },
    { source: 'purplepass', value: purplepass?.[field], score: candidateScore(field, 'purplepass', purplepass?.[field], purplepass?.evidence?.[field]) },
    { source: 'facebook', value: facebook?.[field], score: candidateScore(field, 'facebook', facebook?.[field], facebook?.evidence?.[field]) },
  ].filter((candidate) => candidate.score > -Infinity);

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  let chosen = ranked[0] || { source: 'existing', value: currentValue, score: 0 };
  const existing = candidates.find((candidate) => candidate.source === 'existing');

  if (!manual && existing && chosen.source !== 'existing' && chosen.score - existing.score < 12) {
    chosen = existing;
  }

  const reviewCandidates = candidates.filter((candidate) => candidate.source !== 'existing' || manual);
  const distinctReviewCandidates = reviewCandidates.filter((candidate, index) =>
    reviewCandidates.findIndex((other) => valuesEqual(other.value, candidate.value)) === index,
  );
  const hasExternalConflict = distinctReviewCandidates.some((candidate) => candidate.source === 'purplepass') &&
    distinctReviewCandidates.some((candidate) => candidate.source === 'facebook');
  const hasManualConflict = manual && distinctReviewCandidates.some((candidate) =>
    candidate.source !== 'existing' && !valuesEqual(candidate.value, currentValue)
  );
  const flag = (hasExternalConflict || hasManualConflict) ? {
    field,
    label: DISPLAY_NAMES[field] || field,
    severity: distinctReviewCandidates.length > 2 ? 'review' : 'warning',
    message: `${DISPLAY_NAMES[field] || field} differs between sources; ${chosen.source} was published.`,
    chosen: { source: chosen.source, value: chosen.value },
    candidates: distinctReviewCandidates.map(({ source, value, score }) => ({ source, value, score: Math.round(score) })),
  } : null;

  return { value: chosen.value ?? '', source: chosen.source, manual, flag };
}

export function mergeEvent({
  eventKey,
  existing,
  purplepass,
  facebook,
  previousState,
}) {
  const data = existing?.data || {};
  const lockedFields = new Set(data.lockedFields || []);
  const previousPublished = previousState?.lastPublished || null;
  const fields = [
    'title',
    'date',
    'doorsTime',
    'showTime',
    'venue',
    'city',
    'ageRestriction',
    'price',
    'ticketUrl',
    'facebookEventUrl',
    'status',
  ];

  const merged = {};
  const fieldSources = {};
  const flags = [];
  const manualFields = [];

  for (const field of fields) {
    const result = selectField({
      field,
      currentValue: data[field],
      purplepass,
      facebook,
      previousPublished,
      lockedFields,
    });
    if (cleanText(result.value) || ['doorsTime', 'showTime', 'ageRestriction', 'price', 'facebookEventUrl'].includes(field)) {
      merged[field] = result.value || undefined;
    }
    fieldSources[field] = result.source;
    if (result.manual) manualFields.push(field);
    if (result.flag) flags.push({ eventKey, title: merged.title || data.title || purplepass?.title || facebook?.title, ...result.flag });
  }

  const descriptionResult = selectField({
    field: 'description',
    currentValue: existing?.body || '',
    purplepass,
    facebook,
    previousPublished,
    lockedFields,
  });
  fieldSources.description = descriptionResult.source;
  if (descriptionResult.manual) manualFields.push('description');
  if (descriptionResult.flag) flags.push({ eventKey, title: merged.title || data.title, ...descriptionResult.flag });

  if (purplepass && facebook) {
    const ppDate = normalizeComparable(purplepass.date);
    const fbDate = normalizeComparable(facebook.date);
    if (ppDate && fbDate && ppDate !== fbDate && isLikelyDefaultDate(facebook.date)) {
      flags.push({
        eventKey,
        title: merged.title,
        field: 'date',
        label: 'date',
        severity: 'warning',
        message: 'Facebook uses December 31, which may be a default date; Purplepass was published.',
        chosen: { source: fieldSources.date, value: merged.date },
        candidates: [
          { source: 'purplepass', value: purplepass.date },
          { source: 'facebook', value: facebook.date },
        ],
      });
    }
  }

  return {
    eventKey,
    data: {
      ...data,
      ...merged,
      syncId: eventKey,
      imageLocked: Boolean(data.imageLocked),
      lockedFields: [...lockedFields],
      featured: Boolean(data.featured),
    },
    body: descriptionResult.value || '',
    fieldSources,
    flags,
    manualFields,
    sourceIds: {
      ...(purplepass?.sourceId ? { purplepass: purplepass.sourceId } : {}),
      ...(facebook?.sourceId ? { facebookPost: facebook.sourceId } : {}),
    },
    sourceUrls: {
      ...(purplepass?.sourceUrl ? { purplepass: purplepass.sourceUrl } : {}),
      ...(facebook?.sourceUrl ? { facebook: facebook.sourceUrl } : {}),
    },
    sourceImages: [...(purplepass?.images || []), ...(facebook?.images || [])],
  };
}
