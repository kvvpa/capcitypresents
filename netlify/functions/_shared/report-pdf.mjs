import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value = '') {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? JSON.stringify(item) : item).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  const text = safeText(value ?? '');
  return text.length > 500 ? `${text.slice(0, 497)}...` : text || '(blank)';
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function flagAge(acknowledgedAt, until, reviewsSpanned) {
  if (!acknowledgedAt) return 'Unresolved.';
  const days = Math.max(0, Math.round((new Date(until) - new Date(acknowledgedAt)) / 86400000));
  const reviews = reviewsSpanned ? `, carried through ${reviewsSpanned} review${reviewsSpanned === 1 ? '' : 's'}` : '';
  return `Unresolved ${days} day${days === 1 ? '' : 's'}${reviews}; acknowledged ${formatDate(acknowledgedAt)}.`;
}

function wrapText(text, font, size, maxWidth) {
  const paragraphs = safeText(text).split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function createReviewPdf(report) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const colors = {
    ink: rgb(0.12, 0.12, 0.14),
    muted: rgb(0.38, 0.40, 0.44),
    red: rgb(0.63, 0.08, 0.12),
    pale: rgb(0.95, 0.95, 0.96),
  };
  let page;
  let y;

  function addPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    page.drawText('CapCity Presents - Event Review Report', {
      x: MARGIN,
      y: PAGE_HEIGHT - 28,
      size: 8,
      font: bold,
      color: colors.muted,
    });
    return page;
  }

  function need(height) {
    if (!page || y - height < MARGIN + 20) addPage();
  }

  function line(text, {
    size = 9,
    font = regular,
    color = colors.ink,
    indent = 0,
    gap = 3,
  } = {}) {
    const wrapped = wrapText(text, font, size, CONTENT_WIDTH - indent);
    need(Math.max(1, wrapped.length) * (size + 3) + gap);
    for (const row of wrapped) {
      page.drawText(row || ' ', { x: MARGIN + indent, y, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  }

  function heading(text, level = 1) {
    const size = level === 1 ? 16 : 12;
    need(size + 14);
    if (level === 1) {
      page.drawRectangle({ x: MARGIN, y: y - 5, width: 5, height: size + 4, color: colors.red });
    }
    page.drawText(safeText(text), {
      x: MARGIN + (level === 1 ? 13 : 0),
      y,
      size,
      font: bold,
      color: colors.ink,
    });
    y -= size + 10;
  }

  function changeGroup(change) {
    need(42);
    line(`${change.author} - ${formatDate(change.timestamp)} - ${change.shortSha}`, {
      size: 9,
      font: bold,
      color: change.automated ? colors.muted : colors.red,
      gap: 1,
    });
    line(change.message, { size: 8, color: colors.muted, gap: 4 });
    for (const event of change.events) {
      line(event.title, { size: 10, font: bold, indent: 8, gap: 2 });
      for (const field of event.fields) {
        line(`${field.field}`, { size: 8, font: bold, indent: 16, gap: 0 });
        line(`Before: ${displayValue(field.before)}`, { size: 8, color: colors.muted, indent: 24, gap: 0 });
        line(`After: ${displayValue(field.after)}`, { size: 8, indent: 24, gap: 4 });
      }
    }
    y -= 4;
  }

  function flagGroup(flag, note = '') {
    line(`${flag.title || flag.eventKey} - ${flag.label || flag.field}`, { size: 9, font: bold, gap: 1 });
    line(flag.message || 'Source conflict requires review.', { size: 8, color: colors.muted, indent: 8, gap: 1 });
    if (flag.chosen) line(`Published: ${flag.chosen.source} - ${displayValue(flag.chosen.value)}`, { size: 8, indent: 8, gap: note ? 1 : 4 });
    if (note) line(note, { size: 8, font: bold, color: colors.red, indent: 8, gap: 4 });
    y -= 6;
  }

  addPage();
  page.drawText('Weekly Event Review', { x: MARGIN, y, size: 24, font: bold, color: colors.ink });
  y -= 36;
  line(`Reviewer: ${report.reviewer || 'Unknown'}`, { size: 10, font: bold });
  line(`Review opened: ${formatDate(report.startedAt)}`, { size: 9 });
  line(`Report exported: ${formatDate(report.completedAt)}`, { size: 9 });
  line(`Review baseline: ${report.baselineSha?.slice(0, 7) || 'Unknown'}`, { size: 9 });
  line(`Current revision: ${report.headSha?.slice(0, 7) || 'Unknown'}`, { size: 9, gap: 14 });
  const summaryText = `${report.summary.beforeCount} change set(s) before review; ${report.summary.manualCount} manual change set(s) during review; ${report.summary.newCount} new flag(s); ${report.summary.standingCount} still unresolved; ${report.summary.completedCount} resolved.`;
  const summaryLines = wrapText(summaryText, bold, 11, CONTENT_WIDTH - 24);
  const summaryHeight = summaryLines.length * 14 + 22;
  need(summaryHeight + 10);
  page.drawRectangle({ x: MARGIN, y: y - summaryHeight + 7, width: CONTENT_WIDTH, height: summaryHeight, color: colors.pale });
  let summaryY = y - 13;
  for (const summaryLine of summaryLines) {
    page.drawText(summaryLine, { x: MARGIN + 12, y: summaryY, size: 11, font: bold, color: colors.ink });
    summaryY -= 14;
  }
  y -= summaryHeight + 10;

  heading('Changes before review');
  if (!report.beforeChanges.length) line('No event changes were recorded since the previous review.', { color: colors.muted });
  report.beforeChanges.forEach(changeGroup);

  heading('Manual corrections during review');
  if (!report.manualChanges.length) line('No manual event corrections were recorded during this review.', { color: colors.muted });
  report.manualChanges.forEach(changeGroup);

  if (report.automatedDuringReview.length) {
    heading('Automated changes during review');
    report.automatedDuringReview.forEach(changeGroup);
  }

  heading('New flags');
  if (!report.newFlags.length) line('No new flags this review.', { color: colors.muted });
  report.newFlags.forEach((flag) => flagGroup(flag));

  heading('Standing flags - still unresolved');
  if (!report.standingFlags.length) line('Nothing acknowledged is still outstanding.', { color: colors.muted });
  report.standingFlags.forEach((flag) => flagGroup(flag, flagAge(flag.acknowledgedAt, report.completedAt, flag.reviewsSpanned)));

  heading('Resolved since acknowledgement');
  if (!report.completedFlags.length) line('No acknowledged flags self-corrected this period.', { color: colors.muted });
  report.completedFlags.forEach((flag) => flagGroup(flag, `Resolved - self-corrected (acknowledged ${formatDate(flag.acknowledgedAt)}).`));

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 55,
      y: 24,
      size: 8,
      font: regular,
      color: colors.muted,
    });
  });

  return pdf.save();
}
