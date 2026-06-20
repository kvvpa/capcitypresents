import TurndownService from 'turndown';
import {
  cleanText,
  findFacebookEventUrl,
  findPurplepassUrl,
  formatTime,
  parseDateFromText,
  parsePurplepassId,
  parseTimesFromText,
  titleSimilarity,
  uniqueBy,
} from './utils.mjs';

const turndown = new TurndownService({ bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
turndown.addRule('blankParagraphs', {
  filter: (node) => node.nodeName === 'P' && !cleanText(node.textContent || ''),
  replacement: () => '\n\n',
});

function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Purplepass page did not include structured event data.');
  return JSON.parse(match[1]);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CapCityPresentsEventSync/1.0 (+https://capcitypresents.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function priceFromEvent(event) {
  const lines = cleanText(event.shortDescription || '')
    .split('\n')
    .filter((line) => /\$\s?\d/.test(line));
  if (lines.length) {
    return cleanText(lines.at(-1))
      .replace(/(\d)(after fees)/i, '$1 $2')
      .replace(/\s+([,.;:])/g, '$1');
  }

  const prices = (event.prices || [])
    .filter((price) => price.price)
    .map((price) => Number(price.price))
    .filter(Number.isFinite);
  if (!prices.length) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2).replace(/\.00$/, '')}` : `$${min.toFixed(2)}-$${max.toFixed(2)}`;
}

function normalizeVenue(venue = '') {
  if (/^wild child(?: taps)?$/i.test(cleanText(venue))) return 'Wild Child';
  return cleanText(venue);
}

function statusFromPurplepass(event) {
  const text = `${event.name || ''}\n${event.shortDescription || ''}\n${event.description || ''}`;
  if (/\b(cancelled|canceled)\b/i.test(text)) return 'cancelled';
  if (event.isCapacityReached || /\bsold\s*out\b/i.test(text)) return 'sold-out';
  return 'announced';
}

function timeMinutes(value = '') {
  const match = String(value).match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function fetchPurplepassEvents({ organizerId = '42425' } = {}) {
  const organizerUrl = `https://www.purplepass.com/organizer/${organizerId}`;
  const organizerData = extractNextData(await fetchText(organizerUrl));
  const groups = organizerData?.props?.pageProps?.data?.rows?.events || [];
  const summaries = groups.flatMap((group) => group.data || []);

  const usable = summaries.filter((event) => {
    const text = `${event.name || ''} ${event.shortDescription || ''}`;
    return !/\btest\b.*\b(do not purchase|refunds? will not be issued)\b/i.test(text);
  });

  return mapWithConcurrency(usable, 5, async (summary) => {
    const sourceUrl = `https://www.purplepass.com/events/${summary.slug}`;
    const pageData = extractNextData(await fetchText(sourceUrl));
    const event = pageData?.props?.pageProps?.data?.event;
    if (!event) throw new Error(`Purplepass event ${summary.id} did not contain event details.`);

    const description = cleanText(turndown.turndown(event.description || ''));
    const date = String(event.startsOn || event.startsOnTime || summary.eventStartTime || '').slice(0, 10);
    const showTime = formatTime(String(event.startsOn || event.startsOnTime || summary.eventStartTime || '').slice(11, 19));
    const descriptionTimes = parseTimesFromText(event.shortDescription || '');
    const structuredDoors = formatTime(event.doorsOpen || '');
    const structuredDoorsMinutes = timeMinutes(structuredDoors);
    const showMinutes = timeMinutes(showTime);
    const descriptionDoorsMinutes = timeMinutes(descriptionTimes.doorsTime);
    const doorsTime = (
      structuredDoorsMinutes !== null &&
      showMinutes !== null &&
      structuredDoorsMinutes >= showMinutes &&
      descriptionDoorsMinutes !== null &&
      descriptionDoorsMinutes < showMinutes
    ) ? descriptionTimes.doorsTime : (structuredDoors || descriptionTimes.doorsTime);
    const imageUrl = event.imgUrl || event.eventBackgroundImage || summary.eventImgUrl || '';

    return {
      source: 'purplepass',
      sourceId: String(event.id),
      sourceUrl,
      title: cleanText(event.name),
      date,
      doorsTime,
      showTime,
      venue: normalizeVenue(event.venue),
      city: [cleanText(event.city), cleanText(event.state)].filter(Boolean).join(', '),
      ageRestriction: cleanText(event.ages),
      price: priceFromEvent(event),
      ticketUrl: sourceUrl,
      facebookEventUrl: findFacebookEventUrl(`${event.description || ''}\n${event.shortDescription || ''}`),
      description,
      status: statusFromPurplepass(event),
      images: imageUrl ? [{
        source: 'purplepass',
        remoteUrl: new URL(imageUrl, 'https://www.purplepass.com').toString(),
      }] : [],
      evidence: {
        date: 'ticket-page',
        doorsTime: event.doorsOpen ? 'ticket-page' : 'description',
        showTime: 'ticket-page',
        title: 'ticket-page',
      },
    };
  });
}

function flattenAttachments(attachments = []) {
  const rows = [];
  for (const attachment of attachments) {
    rows.push(attachment);
    const nested = attachment?.subattachments?.data || [];
    rows.push(...flattenAttachments(nested));
  }
  return rows;
}

function attachmentImage(attachment) {
  const image = attachment?.media?.image;
  if (!image?.src) return null;
  return {
    source: 'facebook',
    remoteUrl: image.src,
    width: Number(image.width || 0) || undefined,
    height: Number(image.height || 0) || undefined,
  };
}

function postTitle(post, attachments) {
  const attachmentTitle = attachments
    .map((attachment) => cleanText(attachment.title || ''))
    .find((title) => title && !/facebook|photos|timeline/i.test(title));
  if (attachmentTitle) return attachmentTitle;

  return cleanText(post.message || '')
    .split('\n')
    .map(cleanText)
    .find((line) => line && !/^capcity presents:?$/i.test(line) && !/^https?:\/\//i.test(line)) || '';
}

function postUrls(post, attachments) {
  const raw = [
    post.message,
    post.permalink_url,
    ...attachments.flatMap((attachment) => [
      attachment.url,
      attachment.target?.url,
      attachment.description,
    ]),
  ].filter(Boolean).join('\n');
  return {
    facebookEventUrl: findFacebookEventUrl(raw),
    purplepassUrl: findPurplepassUrl(raw),
  };
}

export async function fetchFacebookEvents({
  pageId = process.env.FACEBOOK_PAGE_ID,
  accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
  apiVersion = process.env.FACEBOOK_GRAPH_VERSION || 'v25.0',
} = {}) {
  if (!pageId || !accessToken) {
    return { events: [], warning: 'Facebook sync is not configured yet.' };
  }

  const fields = [
    'id',
    'message',
    'created_time',
    'permalink_url',
    'from{id,name}',
    'attachments{media_type,title,description,url,target,media,subattachments}',
  ].join(',');
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}/feed`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', accessToken);

  const posts = [];
  let nextUrl = url.toString();
  for (let page = 0; nextUrl && page < 4; page++) {
    const response = await fetch(nextUrl);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Facebook Graph API error: ${payload?.error?.message || response.status}`);
    }
    posts.push(...(payload.data || []));
    nextUrl = payload.paging?.next || '';
  }

  const currentYear = new Date().getFullYear();
  const events = posts.filter((post) => String(post.from?.id || '') === String(pageId)).map((post) => {
    const attachments = flattenAttachments(post.attachments?.data || []);
    const message = cleanText(post.message || '');
    const urls = postUrls(post, attachments);
    const date = parseDateFromText(`${message}\n${attachments.map((item) => item.description || '').join('\n')}`, currentYear);
    const times = parseTimesFromText(message);
    const images = uniqueBy(attachments.map(attachmentImage).filter(Boolean), (image) => image.remoteUrl);
    const title = postTitle(post, attachments);
    const ageLine = message.split('\n').find((line) => /\b(all ages|21\+|18\+)\b/i.test(line)) || '';
    const priceLine = message.split('\n').find((line) => /\$\s?\d/.test(line)) || '';
    const venueLine = message.split('\n').find((line) => /\bwild child(?: taps)?\b/i.test(line)) || '';

    return {
      source: 'facebook',
      sourceId: String(post.id),
      sourceUrl: post.permalink_url || '',
      title,
      date,
      doorsTime: times.doorsTime,
      showTime: times.showTime,
      venue: /wild child/i.test(venueLine) ? 'Wild Child' : '',
      city: /\bolympia\b/i.test(message) ? 'Olympia, WA' : '',
      ageRestriction: cleanText(ageLine.match(/\b(All Ages|21\+|18\+)\b/i)?.[1] || ''),
      price: cleanText(priceLine),
      ticketUrl: urls.purplepassUrl,
      facebookEventUrl: urls.facebookEventUrl || post.permalink_url || '',
      description: message,
      status: /\b(cancelled|canceled)\b/i.test(message) ? 'cancelled' : /\bsold\s*out\b/i.test(message) ? 'sold-out' : 'announced',
      images,
      purplepassId: parsePurplepassId(urls.purplepassUrl),
      evidence: {
        date: date && message.match(new RegExp(date.slice(0, 4))) ? 'post-text-explicit' : 'post-text',
        doorsTime: times.doorsTime ? 'post-text' : '',
        showTime: times.showTime ? 'post-text' : '',
        title: attachments.some((attachment) => cleanText(attachment.title || '') === title) ? 'attachment-title' : 'post-text',
      },
    };
  }).filter((event) => {
    const hasEventLink = Boolean(event.facebookEventUrl.match(/facebook\.com\/events\//i));
    const hasPurplepassLink = Boolean(event.purplepassId);
    return hasPurplepassLink || (hasEventLink && event.title && event.date);
  });

  return { events, warning: '' };
}

export function attachFacebookToPurplepass(purplepassEvents, facebookEvents) {
  const unmatchedFacebook = new Set(facebookEvents);
  const combined = purplepassEvents.map((purplepass) => {
    let match = facebookEvents.find((facebook) => facebook.purplepassId === purplepass.sourceId);
    if (!match) {
      match = facebookEvents
        .filter((facebook) => facebook.date === purplepass.date)
        .sort((a, b) => titleSimilarity(b.title, purplepass.title) - titleSimilarity(a.title, purplepass.title))
        .find((facebook) => titleSimilarity(facebook.title, purplepass.title) >= 0.45);
    }
    if (match) unmatchedFacebook.delete(match);
    return { purplepass, facebook: match || null };
  });

  for (const facebook of unmatchedFacebook) {
    combined.push({ purplepass: null, facebook });
  }
  return combined;
}
