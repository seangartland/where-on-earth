// Per-image attribution step (BRIEF-image-r2-ingest.md deliverable 1):
// fetches license, author, and the Commons file-page URL from the Commons
// API for each canonical source's file page. Responses are cached on disk
// keyed by canonical URL (not by content sha256 -- attribution is resolved
// before the source is ever downloaded) so a rerun against a warm cache
// costs zero API calls, including for sources that previously failed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { USER_AGENT, withRetry, sleep } from './http.js';

const COMMONS_API_BASE = 'https://commons.wikimedia.org/w/api.php';

// Derives the Commons "File:<name>" page title from any of the three
// Wikimedia URL shapes seen in the data files: a thumb.wikimedia.org or
// upload.wikimedia.org rendition path, or a commons.wikimedia.org
// Special:Redirect/Special:FilePath/File: page link. Returns null when the
// URL does not resolve to a recognizable file page (an unresolvable
// filename, per the design, is an attribution failure, not a crash).
export function commonsFileTitle(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'commons.wikimedia.org') {
    if (segments[0] !== 'wiki' || segments.length < 2) return null;
    const rest = segments.slice(1);
    if (/^Special:Redirect$/i.test(rest[0]) && /^file$/i.test(rest[1] || '') && rest[2]) {
      return `File:${decodeURIComponent(rest[2])}`;
    }
    if (/^Special:FilePath$/i.test(rest[0]) && rest[1]) {
      return `File:${decodeURIComponent(rest[1])}`;
    }
    const joined = decodeURIComponent(rest.join('/'));
    if (/^File:/i.test(joined)) return `File:${joined.slice(joined.indexOf(':') + 1)}`;
    return null;
  }

  if (host === 'upload.wikimedia.org' || host === 'thumb.wikimedia.org') {
    const thumbIndex = segments.indexOf('thumb');
    if (thumbIndex !== -1 && segments.length > thumbIndex + 3) {
      return `File:${decodeURIComponent(segments[thumbIndex + 3])}`;
    }
    if (segments.length > 0) {
      return `File:${decodeURIComponent(segments[segments.length - 1])}`;
    }
    return null;
  }

  return null;
}

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function textValue(field) {
  if (!field || typeof field.value !== 'string') return null;
  const stripped = stripHtml(field.value);
  return stripped.length > 0 ? stripped : null;
}

function commonsPageUrlFromTitle(title) {
  const normalized = title.replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(normalized).replace(/%3A/g, ':')}`;
}

// Turns one Commons API page object (or null for "not found") into the
// attribution result for a manifest row. Refuses to report success without
// both a license and an author string -- "copying a URL is not a license
// record" (design, Pi-side ingest step 1).
export function buildAttributionResult(page, { title } = {}) {
  if (!page || page.missing != null) {
    return { status: 'failed', reason: 'commons-page-missing' };
  }
  const extmetadata = page.imageinfo?.[0]?.extmetadata;
  if (!extmetadata) {
    return { status: 'failed', reason: 'no-imageinfo' };
  }
  const license = textValue(extmetadata.LicenseShortName) || textValue(extmetadata.License);
  const author = textValue(extmetadata.Artist) || textValue(extmetadata.Credit);
  if (!license || !author) {
    return { status: 'failed', reason: 'missing-attribution-fields' };
  }
  const sourcePageUrl = page.canonicalurl || commonsPageUrlFromTitle(page.title || title);
  return {
    status: 'ok',
    license,
    author,
    attribution: `${author} / Wikimedia Commons`,
    sourcePageUrl,
  };
}

function buildPageIndex(query) {
  const pagesByTitle = new Map();
  for (const page of Object.values(query.pages || {})) {
    pagesByTitle.set(page.title, page);
  }
  const redirectFrom = new Map();
  for (const entry of query.normalized || []) redirectFrom.set(entry.from, entry.to);
  for (const entry of query.redirects || []) redirectFrom.set(entry.from, entry.to);
  return { pagesByTitle, redirectFrom };
}

function resolvePage(requestedTitle, { pagesByTitle, redirectFrom }) {
  let title = requestedTitle;
  const seen = new Set();
  while (redirectFrom.has(title) && !seen.has(title)) {
    seen.add(title);
    title = redirectFrom.get(title);
  }
  return pagesByTitle.get(title) || null;
}

// Live Commons API call for one batch of titles (<=50 per the design's
// "batch the API calls politely"). Returns Map<title, pageObjectOrNull>.
// Retried with backoff via withRetry, honoring 429/5xx like the rest of
// this pipeline's HTTP calls.
export async function fetchAttributionBatchLive(titles, { timeoutMs = 20000 } = {}) {
  return withRetry(async () => {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      redirects: '1',
      prop: 'info|imageinfo',
      inprop: 'url',
      iiprop: 'extmetadata',
      titles: titles.join('|'),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${COMMONS_API_BASE}?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        return { retryAfterMs: 2000, error: new Error(`HTTP ${res.status}`) };
      }
      if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
      const json = await res.json();
      const index = buildPageIndex(json.query || {});
      const map = new Map();
      for (const title of titles) map.set(title, resolvePage(title, index));
      return map;
    } finally {
      clearTimeout(timer);
    }
  });
}

function cacheKeyForUrl(canonicalUrl) {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

function cachePathFor(cacheDir, canonicalUrl) {
  const key = cacheKeyForUrl(canonicalUrl);
  return path.join(cacheDir, key.slice(0, 2), `${key}.json`);
}

export function readAttributionCache(cacheDir, canonicalUrl) {
  const file = cachePathFor(cacheDir, canonicalUrl);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeAttributionCacheAtomic(cacheDir, canonicalUrl, result) {
  const file = cachePathFor(cacheDir, canonicalUrl);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpFile, JSON.stringify(result));
  renameSync(tmpFile, file);
}

// Resolves attribution for a list of canonical sources: cache hit (success
// or failure, keyed by canonical URL) short-circuits with zero API calls;
// everything else is grouped by Commons file title (so two canonical URLs
// for the same underlying file cost one lookup), fetched in batches with a
// delay between batches, and cached as it resolves. Returns
// Map<canonicalUrl, attributionResult>.
export async function fetchAttributionForCanonicalSources(canonicalSources, {
  cacheDir = null,
  batchSize = 50,
  delayMs = 500,
  fetchBatch = fetchAttributionBatchLive,
} = {}) {
  const results = new Map();
  const urlsByTitle = new Map();

  for (const source of canonicalSources) {
    const title = commonsFileTitle(source.canonicalUrl);
    if (!title) {
      results.set(source.canonicalUrl, { status: 'failed', reason: 'unresolvable-filename' });
      continue;
    }
    const cached = cacheDir ? readAttributionCache(cacheDir, source.canonicalUrl) : null;
    if (cached) {
      results.set(source.canonicalUrl, cached);
      continue;
    }
    if (!urlsByTitle.has(title)) urlsByTitle.set(title, []);
    urlsByTitle.get(title).push(source.canonicalUrl);
  }

  const titles = [...urlsByTitle.keys()];
  for (let i = 0; i < titles.length; i += batchSize) {
    const batchTitles = titles.slice(i, i + batchSize);
    const pagesByTitle = await fetchBatch(batchTitles);
    for (const title of batchTitles) {
      const page = pagesByTitle.get(title) ?? null;
      const result = buildAttributionResult(page, { title });
      for (const canonicalUrl of urlsByTitle.get(title)) {
        results.set(canonicalUrl, result);
        if (cacheDir) writeAttributionCacheAtomic(cacheDir, canonicalUrl, result);
      }
    }
    if (delayMs > 0 && i + batchSize < titles.length) await sleep(delayMs);
  }

  return results;
}
