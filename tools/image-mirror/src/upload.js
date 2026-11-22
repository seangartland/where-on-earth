import { sha256 } from './transcode.js';

// Create-only upload (design step 5: "Use create-only semantics: if a key
// exists, verify its size, checksum metadata, and content type; never
// overwrite it"). A mismatched existing object is reported, never
// clobbered -- cleanup of a bad object is a separately reviewed decision,
// not something this pipeline does automatically.
export async function uploadVariantCreateOnly(client, { key, body, contentType, expectedSha256 }) {
  const existing = await client.getObject({ key });
  if (existing.status === 200) {
    const sizeOk = existing.body.length === body.length;
    const shaOk = expectedSha256 ? sha256(existing.body) === expectedSha256 : true;
    return {
      key,
      outcome: 'exists',
      ok: sizeOk && shaOk,
      detail: sizeOk && shaOk ? 'existing object matches' : 'existing object mismatch -- not overwritten',
    };
  }

  const put = await client.putObject({
    key,
    body,
    contentType,
    metadata: expectedSha256 ? { sha256: expectedSha256 } : {},
  });
  return {
    key,
    outcome: 'uploaded',
    ok: put.status === 200,
    detail: put.status === 200 ? 'uploaded' : `put failed (HTTP ${put.status})`,
  };
}
