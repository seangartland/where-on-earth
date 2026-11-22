// Shared HTTP conventions for talking to Wikimedia: a descriptive user
// agent, bounded concurrency, and exponential backoff that honors
// Retry-After, per docs/image-r2-mirror-design.md's Pi-side ingest section.

export const USER_AGENT = 'WhereOnEarthImageMirror/1.0 (+https://where-on.earth/credits.html)';

export async function withRetry(fn, { retries = 3, baseDelayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await fn(attempt);
      if (result && result.retryAfterMs != null) {
        await sleep(result.retryAfterMs);
        lastError = result.error ?? new Error('retryable response');
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs `worker` over `items` with at most `concurrency` in flight at once,
// in item order for the result array, with a small delay between dispatches
// on the same lane as a per-host rate limit.
export async function mapWithConcurrency(items, worker, { concurrency = 8, delayMs = 0 } = {}) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function lane() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, () => lane());
  await Promise.all(lanes);
  return results;
}

function retryAfterMs(headers) {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

// HEAD first; if the server doesn't return Content-Length on HEAD, fall back
// to a 1-byte ranged GET (Content-Range exposes the full size without
// downloading the body) -- this is "the design's stated method" alternative
// named in BRIEF-image-r2-build.md deliverable 2, used only when HEAD alone
// is insufficient. Neither path downloads the image body in bulk.
export async function headSize(url, { timeoutMs = 15000 } = {}) {
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        return { retryAfterMs: retryAfterMs(res.headers) ?? 2000, error: new Error(`HTTP ${res.status}`) };
      }
      if (!res.ok) return { ok: false, status: res.status, bytes: null };
      const len = res.headers.get('content-length');
      if (len != null) return { ok: true, status: res.status, bytes: Number(len), method: 'HEAD' };
      return rangedSize(url, { timeoutMs, status: res.status });
    } finally {
      clearTimeout(timer);
    }
  });
}

async function rangedSize(url, { timeoutMs, status }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    const contentRange = res.headers.get('content-range'); // "bytes 0-0/12345"
    const total = contentRange ? Number(contentRange.split('/')[1]) : null;
    if (total != null && Number.isFinite(total)) {
      return { ok: true, status, bytes: total, method: 'ranged-get' };
    }
    const len = res.headers.get('content-length');
    return { ok: len != null, status, bytes: len != null ? Number(len) : null, method: 'ranged-get-fallback' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuffer(url, { timeoutMs = 20000 } = {}) {
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
      if (res.status === 429 || res.status >= 500) {
        return { retryAfterMs: retryAfterMs(res.headers) ?? 2000, error: new Error(`HTTP ${res.status}`) };
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return { ok: res.ok, status: res.status, contentType: res.headers.get('content-type'), buffer };
    } finally {
      clearTimeout(timer);
    }
  });
}
