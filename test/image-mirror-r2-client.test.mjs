import assert from 'node:assert/strict';
import test from 'node:test';

import { createR2Client, DEFAULT_BUCKET } from '../tools/image-mirror/src/r2-client.js';

test('createR2Client refuses to run without an account id and API token', () => {
  assert.throws(() => createR2Client({ accountId: undefined, apiToken: undefined }), /CLOUDFLARE_ACCOUNT_ID/);
});

test('createR2Client defaults to the where-on-earth-tiles bucket', () => {
  const client = createR2Client({ accountId: 'acct', apiToken: 'token' });
  assert.equal(client.bucket, DEFAULT_BUCKET);
  assert.equal(client.bucket, 'where-on-earth-tiles');
});

test('createR2Client honors an explicit bucket override', () => {
  const client = createR2Client({ accountId: 'acct', apiToken: 'token', bucket: 'some-other-bucket' });
  assert.equal(client.bucket, 'some-other-bucket');
});
