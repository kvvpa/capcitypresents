import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  hashBuffer,
  imageScore,
  inferImageKind,
  proxyPurplepass,
  safeExtension,
  uniqueBy,
} from './utils.mjs';

async function inspectBuffer(buffer) {
  const metadata = await sharp(buffer, { animated: false }).metadata();
  return {
    width: Number(metadata.width || 0) || undefined,
    height: Number(metadata.height || 0) || undefined,
  };
}

async function inspectLocal(publicDir, publicPath) {
  if (!publicPath?.startsWith('/')) return null;
  const filePath = path.join(publicDir, publicPath.replace(/^\/+/, ''));
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, ...(await inspectBuffer(buffer)) };
  } catch {
    return null;
  }
}

async function fetchImage(remoteUrl) {
  const response = await fetch(proxyPurplepass(remoteUrl), {
    headers: {
      'User-Agent': 'CapCityPresentsEventSync/1.0 (+https://capcitypresents.com)',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
    },
  });
  if (!response.ok) throw new Error(`Image ${remoteUrl} returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') || '',
    ...(await inspectBuffer(buffer)),
  };
}

export async function materializeEventImages({
  eventKey,
  existingPoster,
  existingPosterSource,
  existingAlternates = [],
  imageLocked = false,
  manualPosterDetected = false,
  sourceImages = [],
  publicDir,
  dryRun = false,
}) {
  const candidates = [];
  const warnings = [];
  const existing = await inspectLocal(publicDir, existingPoster);
  if (existingPoster && existing) {
    const source = existingPosterSource || (existingPoster.startsWith('/uploads/synced/') ? 'unknown' : 'manual');
    candidates.push({
      path: existingPoster,
      source,
      width: existing.width,
      height: existing.height,
      kind: inferImageKind(existing.width, existing.height),
      existing: true,
    });
  }

  for (const alternate of existingAlternates || []) {
    const inspected = await inspectLocal(publicDir, alternate.path);
    candidates.push({
      ...alternate,
      width: alternate.width || inspected?.width,
      height: alternate.height || inspected?.height,
      kind: alternate.kind || inferImageKind(alternate.width || inspected?.width, alternate.height || inspected?.height),
      existing: true,
    });
  }

  for (const sourceImage of sourceImages) {
    if (!sourceImage.remoteUrl) continue;
    try {
      const downloaded = await fetchImage(sourceImage.remoteUrl);
      const width = sourceImage.width || downloaded.width;
      const height = sourceImage.height || downloaded.height;
      const kind = sourceImage.kind || inferImageKind(width, height);
      const hash = hashBuffer(downloaded.buffer);
      const extension = safeExtension(downloaded.contentType, sourceImage.remoteUrl);
      const safeKey = eventKey.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
      const publicPath = `/uploads/synced/${safeKey}-${sourceImage.source}-${hash}${extension}`;
      if (!dryRun) {
        const diskPath = path.join(publicDir, publicPath.replace(/^\/+/, ''));
        await fs.mkdir(path.dirname(diskPath), { recursive: true });
        try {
          await fs.access(diskPath);
        } catch {
          await fs.writeFile(diskPath, downloaded.buffer);
        }
      }
      candidates.push({
        path: publicPath,
        source: sourceImage.source || 'unknown',
        width,
        height,
        kind,
        remoteUrl: sourceImage.remoteUrl,
      });
    } catch (error) {
      warnings.push(error.message);
    }
  }

  const unique = uniqueBy(candidates, (candidate) => candidate.path || candidate.remoteUrl);
  const current = unique.find((candidate) => candidate.path === existingPoster);
  const keepCurrent = current && (imageLocked || manualPosterDetected || current.source === 'manual');
  const selected = keepCurrent
    ? current
    : [...unique].sort((a, b) => imageScore(b) - imageScore(a))[0] || null;

  // Only fall back to a previously-stored poster if it's a local file we can
  // serve. A remote URL (e.g. a Purplepass image that 403s) must never be written
  // as the poster, or the site renders a broken image instead of letting the
  // page fall back to the default stand-in graphic.
  const localExistingPoster = existingPoster?.startsWith('/') ? existingPoster : '';
  return {
    poster: selected?.path || localExistingPoster || '',
    posterSource: selected?.source || existingPosterSource || 'unknown',
    alternateImages: unique
      .filter((candidate) => candidate.path && candidate.path !== selected?.path)
      .map(({ path: imagePath, source, width, height, kind }) => ({
        path: imagePath,
        source,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        kind: kind || 'unknown',
      })),
    warnings,
    candidates: unique.map(({ path: imagePath, source, width, height, kind }) => ({
      path: imagePath,
      source,
      width,
      height,
      kind,
      score: Math.round(imageScore({ source, width, height, kind })),
    })),
  };
}
