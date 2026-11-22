// Cloudflare R2 access via the account-scoped REST API, authenticated with
// a plain bearer API token read from the environment. This is the portable
// production path (the Pi-side ingest has no access to this VM sandbox's
// Cloudflare-connector credential surrogate, so it must carry its own
// token). See R2-BUILD-REPORT.md for how this build's smoke test
// authenticated instead, and for a flagged gap: the exact custom-metadata
// header convention for this native R2 API (as opposed to R2's S3-compatible
// endpoint) was not verified live, so `metadata` here is best-effort and the
// JSONL manifest -- not R2 object metadata -- remains the authoritative
// record of each variant's sha256/bytes.

const API_BASE = 'https://api.cloudflare.com/client/v4';
export const DEFAULT_BUCKET = 'where-on-earth-tiles';

export function createR2Client({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  bucket = process.env.R2_BUCKET || DEFAULT_BUCKET,
} = {}) {
  if (!accountId || !apiToken) {
    throw new Error('createR2Client requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  }
  const authHeaders = { Authorization: `Bearer ${apiToken}` };
  const objectUrl = (key) => `${API_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`;

  async function listObjects({ prefix = '', cursor, perPage = 1000 } = {}) {
    const params = new URLSearchParams({ prefix, per_page: String(perPage) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${API_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?${params}`, {
      headers: authHeaders,
    });
    const json = await res.json();
    return { status: res.status, ...json };
  }

  async function listAllObjects({ prefix = '' } = {}) {
    const objects = [];
    let cursor;
    let pages = 0;
    do {
      const page = await listObjects({ prefix, cursor });
      if (page.status !== 200 || !page.success) {
        throw new Error(`R2 list failed (HTTP ${page.status}): ${JSON.stringify(page.errors ?? page)}`);
      }
      objects.push(...(page.result ?? []));
      cursor = page.result_info?.cursor || null;
      pages += 1;
    } while (cursor);
    return { objects, pages };
  }

  async function putObject({ key, body, contentType, metadata = {} }) {
    const headers = { ...authHeaders, 'Content-Type': contentType };
    for (const [metaKey, metaValue] of Object.entries(metadata)) {
      headers[`cf-r2-metadata-${metaKey}`] = String(metaValue);
    }
    const res = await fetch(objectUrl(key), { method: 'PUT', headers, body });
    const json = await res.json().catch(() => null);
    return { status: res.status, ...json };
  }

  async function getObject({ key }) {
    const res = await fetch(objectUrl(key), { headers: authHeaders });
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body };
  }

  async function deleteObject({ key }) {
    const res = await fetch(objectUrl(key), { method: 'DELETE', headers: authHeaders });
    const json = await res.json().catch(() => null);
    return { status: res.status, ...json };
  }

  return { bucket, accountId, listObjects, listAllObjects, putObject, getObject, deleteObject };
}
