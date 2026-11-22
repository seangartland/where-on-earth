// Pi-side staged ingest runner support (BRIEF-image-r2-ingest.md
// deliverable 2): stage selection, resumability, the pilot sample sheet,
// and file logging. The network/transcode/upload glue lives in
// bin/run.mjs; everything here is pure or filesystem-only so it can be
// unit tested without hitting Wikimedia or R2.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { mirroredUrl } from './keys.js';

export const PILOT_SIZE = 50;
export const SAMPLE_SHEET_WIDTH = 640;
export const SAMPLE_SHEET_MIN_COUNT = 12;

// Serial-ish throttling against Wikimedia (design: "Wikimedia rate limits
// bulk fetches" / brief: "throttles Wikimedia requests to avoid the 429
// pattern hit during the census"). Low fixed concurrency plus a per-item
// delay, not an unbounded pool.
export const PI_FETCH_CONCURRENCY = 2;
export const PI_FETCH_DELAY_MS = 300;

export const STAGES = ['pilot', 'full'];

export function assertValidStage(stage) {
  if (!STAGES.includes(stage)) {
    throw new Error(`unknown stage "${stage}" (expected one of: ${STAGES.join(', ')})`);
  }
}

// PILOT is always the first `pilotSize` canonical sources in inventory
// order (deterministic and reproducible across relaunches). FULL is the
// entire inventory; the "remaining inventory" behavior the brief
// describes comes from pendingSources() skipping rows a prior run already
// completed, not from re-slicing the array -- so FULL after a PILOT
// naturally only does new work, and a killed FULL resumes the same way.
export function sourcesForStage(canonicalSources, stage, { pilotSize = PILOT_SIZE } = {}) {
  assertValidStage(stage);
  return stage === 'pilot' ? canonicalSources.slice(0, pilotSize) : canonicalSources;
}

export function needsWork(manifestRow) {
  return !manifestRow || manifestRow.status !== 'ready';
}

export function pendingSources(sources, manifestByUrl) {
  const pending = [];
  let alreadyDone = 0;
  for (const source of sources) {
    if (needsWork(manifestByUrl.get(source.canonicalUrl))) pending.push(source);
    else alreadyDone += 1;
  }
  return { pending, alreadyDone };
}

// Which newly-uploaded object keys get an extra public-host GET (design
// step 6: "a rotating sample plus every newly uploaded first/last
// object"). Pure selection logic; the actual GET is network I/O done by
// the caller.
export function selectPublicVerificationSample(newlyUploadedKeys, { every = 10 } = {}) {
  if (newlyUploadedKeys.length === 0) return [];
  const sample = new Set([newlyUploadedKeys[0], newlyUploadedKeys[newlyUploadedKeys.length - 1]]);
  for (let i = 0; i < newlyUploadedKeys.length; i += every) sample.add(newlyUploadedKeys[i]);
  return [...sample];
}

// Sample sheet for pilot visual review: "ready" rows with a verified w640
// variant (brief: "a sample sheet of at least 12 mirrored images at the
// 640 width"). ok:false flags a pilot that did not produce enough ready
// rows to review -- it is not itself an exception, just a signal for
// whoever reviews the pilot.
export function buildSampleSheet(manifestRows, { width = SAMPLE_SHEET_WIDTH, minCount = SAMPLE_SHEET_MIN_COUNT } = {}) {
  const entries = [];
  for (const row of manifestRows) {
    if (row.status !== 'ready') continue;
    const variant = (row.variants || []).find((v) => v.width === width && v.status === 'verified');
    if (!variant) continue;
    entries.push({
      canonical_source_url: row.canonical_source_url,
      url: mirroredUrl(row.source_sha256, width),
      sha256: variant.sha256,
      width: variant.actual_width ?? width,
      height: variant.height ?? null,
      attribution: row.attribution,
      source_page_url: row.source_page_url,
    });
  }
  return { ok: entries.length >= minCount, entries, minCount };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function sampleSheetHtml(sampleSheet) {
  const figures = sampleSheet.entries.map((e) => `
    <figure>
      <img src="${escapeHtml(e.url)}" width="${SAMPLE_SHEET_WIDTH}" alt="${escapeHtml(e.attribution || '')}">
      <figcaption>${escapeHtml(e.attribution || '')} &mdash; <a href="${escapeHtml(e.source_page_url || '')}">source</a><br>${escapeHtml(e.sha256)}</figcaption>
    </figure>`).join('\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>R2 photo mirror pilot sample</title></head><body>${figures}</body></html>\n`;
}

export function summarizeManifest(manifestRows) {
  const summary = { total: manifestRows.length, ready: 0, pending: 0, attributionFailed: 0, failed: 0 };
  for (const row of manifestRows) {
    if (row.status === 'ready') summary.ready += 1;
    else if (row.status === 'pending') summary.pending += 1;
    else if (row.status === 'attribution-failed') summary.attributionFailed += 1;
    else summary.failed += 1;
  }
  return summary;
}

export function buildExceptions(manifestRows) {
  return manifestRows
    .filter((row) => row.status !== 'ready')
    .map((row) => ({
      canonical_source_url: row.canonical_source_url,
      source_urls: row.source_urls,
      status: row.status,
      error: row.error,
    }));
}

// Appends timestamped lines to a log file (created if missing) and
// mirrors them to the console, so a killed/relaunched run keeps a durable
// record on disk (brief: "The runner logs to a file").
export function createRunLogger(logFilePath) {
  mkdirSync(path.dirname(logFilePath), { recursive: true });
  return function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    appendFileSync(logFilePath, `${line}\n`);
    console.log(line);
  };
}
