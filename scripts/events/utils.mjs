import crypto from 'node:crypto';
import path from 'node:path';

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export function cleanText(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeComparable(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function valuesEqual(a, b) {
  return normalizeComparable(a) === normalizeComparable(b);
}

export function slugify(value) {
  return normalizeComparable(value)
    .replace(/\band\b/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'event';
}

export function titleSimilarity(a, b) {
  const left = new Set(normalizeComparable(a).split(' ').filter((word) => word.length > 1));
  const right = new Set(normalizeComparable(b).split(' ').filter((word) => word.length > 1));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

export function parsePurplepassId(value = '') {
  return String(value).match(/purplepass\.com\/(?:events\/)?(\d+)-/i)?.[1] || '';
}

export function parseFacebookEventId(value = '') {
  return String(value).match(/facebook\.com\/events\/(\d+)/i)?.[1] || '';
}

export function findFacebookEventUrl(value = '') {
  return String(value).match(/https?:\/\/(?:www\.)?facebook\.com\/events\/\d+[^\s)"'<]*/i)?.[0] || '';
}

export function findPurplepassUrl(value = '') {
  return String(value).match(/https?:\/\/(?:www\.)?purplepass\.com\/(?:events\/)?\d+-[^\s)"'<]*/i)?.[0] || '';
}

export function parseDateFromText(text = '', fallbackYear = new Date().getFullYear()) {
  const normalized = cleanText(text);
  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const monthFirst = normalized.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/i,
  );
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const year = Number(monthFirst[3] || fallbackYear);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(monthFirst[2])).padStart(2, '0')}`;
  }

  const dayFirst = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s+(20\d{2}))?/i,
  );
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const year = Number(dayFirst[3] || fallbackYear);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(dayFirst[1])).padStart(2, '0')}`;
  }

  return '';
}

export function formatTime(value = '') {
  const match = String(value).match(/\b(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?\b/i);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  let meridiem = match[3]?.toUpperCase();

  if (!meridiem && hour <= 23) {
    meridiem = hour >= 12 ? 'PM' : 'AM';
    hour %= 12;
    if (hour === 0) hour = 12;
  }

  if (!meridiem || hour < 1 || hour > 12 || minute > 59) return '';
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export function parseTimesFromText(text = '') {
  const lines = cleanText(text).split('\n');
  let doorsTime = '';
  let showTime = '';

  for (const line of lines) {
    if (!doorsTime && /\bdoors?\b/i.test(line)) {
      doorsTime = formatTime(line);
    }
    if (!showTime && /\b(show|start|music)\b/i.test(line)) {
      showTime = formatTime(line);
    }
  }

  if (!showTime) {
    const times = [...cleanText(text).matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi)]
      .map((match) => formatTime(match[0]))
      .filter(Boolean);
    showTime = times.find((time) => time !== doorsTime) || '';
  }

  return { doorsTime, showTime };
}

export function inferImageKind(width = 0, height = 0) {
  if (!width || !height) return 'unknown';
  const ratio = width / height;
  if (ratio >= 0.52 && ratio <= 0.84) return 'flyer';
  if (ratio >= 0.84 && ratio <= 1.18) return 'platform-graphic';
  if (ratio > 1.18) return 'photo';
  return 'unknown';
}

export function imageScore(image) {
  const width = Number(image.width || 0);
  const height = Number(image.height || 0);
  const area = width * height;
  const kind = image.kind || inferImageKind(width, height);
  let score = Math.min(45, Math.log10(Math.max(area, 1)) * 7);
  if (kind === 'flyer') score += 28;
  if (kind === 'platform-graphic') score += 18;
  if (kind === 'photo') score += 10;
  if (width >= 1000 && height >= 1000) score += 12;
  if (width < 500 || height < 500) score -= 18;
  if (image.source === 'manual') score += 35;
  return score;
}

export function hashBuffer(buffer, length = 10) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, length);
}

export function safeExtension(contentType = '', url = '') {
  const type = contentType.toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.png', '.webp', '.gif', '.jpeg', '.jpg'].includes(ext) ? ext.replace('.jpeg', '.jpg') : '.jpg';
}

export function summarize(value, max = 160) {
  const text = cleanText(Array.isArray(value) ? value.join(', ') : value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export function isLikelyMorningMistake(value = '') {
  const match = String(value).match(/\b(\d{1,2}):(\d{2})\s+AM\b/i);
  if (!match) return false;
  const hour = Number(match[1]);
  return hour >= 4 && hour <= 10;
}

export function isLikelyDefaultDate(value = '') {
  return /-12-31$/.test(String(value));
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
