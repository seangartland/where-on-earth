import assert from 'node:assert/strict';
import test from 'node:test';

import { uploadVariantCreateOnly } from '../tools/image-mirror/src/upload.js';
import { sha256 } from '../tools/image-mirror/src/transcode.js';

function fakeClient({ existing = null, putStatus = 200 } = {}) {
  const calls = { getObject: 0, putObject: 0 };
  return {
    calls,
    async getObject({ key }) {
      calls.getObject += 1;
      if (!existing) return { status: 404, body: Buffer.alloc(0) };
      return { status: 200, body: existing, key };
    },
    async putObject({ key, body, contentType }) {
      calls.putObject += 1;
      return { status: putStatus, key, body, contentType };
    },
  };
}

test('uploads a fresh object when the key does not exist yet', async () => {
  const client = fakeClient();
  const body = Buffer.from('hello');
  const result = await uploadVariantCreateOnly(client, { key: 'photos/v1/sha256/aa/w256.webp', body, contentType: 'image/webp', expectedSha256: sha256(body) });
  assert.equal(result.outcome, 'uploaded');
  assert.equal(result.ok, true);
  assert.equal(client.calls.putObject, 1);
});

test('never overwrites an existing object that matches size and checksum', async () => {
  const body = Buffer.from('hello');
  const client = fakeClient({ existing: body });
  const result = await uploadVariantCreateOnly(client, { key: 'photos/v1/sha256/aa/w256.webp', body, contentType: 'image/webp', expectedSha256: sha256(body) });
  assert.equal(result.outcome, 'exists');
  assert.equal(result.ok, true);
  assert.equal(client.calls.putObject, 0);
});

test('reports a mismatch -- but still never overwrites -- when an existing object differs', async () => {
  const body = Buffer.from('hello');
  const different = Buffer.from('goodbye!!');
  const client = fakeClient({ existing: different });
  const result = await uploadVariantCreateOnly(client, { key: 'photos/v1/sha256/aa/w256.webp', body, contentType: 'image/webp', expectedSha256: sha256(body) });
  assert.equal(result.outcome, 'exists');
  assert.equal(result.ok, false);
  assert.equal(client.calls.putObject, 0);
});

test('reports a failed put without throwing when R2 rejects the upload', async () => {
  const body = Buffer.from('hello');
  const client = fakeClient({ putStatus: 500 });
  const result = await uploadVariantCreateOnly(client, { key: 'photos/v1/sha256/aa/w256.webp', body, contentType: 'image/webp', expectedSha256: sha256(body) });
  assert.equal(result.outcome, 'uploaded');
  assert.equal(result.ok, false);
});
