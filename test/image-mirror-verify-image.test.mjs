import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyDownloadedImage } from '../tools/image-mirror/src/verify-image.js';
import { createSolidImageBuffer } from '../tools/image-mirror/src/test-fixtures.js';

test('rejects an HTML error page even when it claims to be an image', async () => {
  const html = Buffer.from('<!DOCTYPE html><html><body>404 Not Found</body></html>');
  const result = await verifyDownloadedImage(html, { sourceUrl: 'https://upload.wikimedia.org/x/a.jpg' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'html-error-page');
});

test('rejects an empty body', async () => {
  const result = await verifyDownloadedImage(Buffer.alloc(0));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty-body');
});

test('rejects bytes that do not decode as an image', async () => {
  const result = await verifyDownloadedImage(Buffer.from('not an image, just text bytes that are long enough to not look like html'));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'decode-failed');
});

test('accepts a well-formed image and reports its decoded dimensions', async () => {
  const buffer = await createSolidImageBuffer(400, 200);
  const result = await verifyDownloadedImage(buffer);
  assert.equal(result.ok, true);
  assert.equal(result.width, 400);
  assert.equal(result.height, 200);
  assert.equal(result.format, 'jpeg');
});

test('rejects a thumbnail whose decoded width is larger than the width encoded in its URL', async () => {
  const buffer = await createSolidImageBuffer(1280, 640);
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/x.jpg/500px-x.jpg';
  const result = await verifyDownloadedImage(buffer, { sourceUrl: url });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'width-mismatch');
  assert.equal(result.encodedWidth, 500);
  assert.equal(result.decodedWidth, 1280);
});

test('accepts a decoded width smaller than the URL-encoded width (documented smaller-original behavior)', async () => {
  const buffer = await createSolidImageBuffer(300, 150);
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/x.jpg/1280px-x.jpg';
  const result = await verifyDownloadedImage(buffer, { sourceUrl: url });
  assert.equal(result.ok, true);
  assert.equal(result.width, 300);
});

test('a non-thumbnail Wikimedia URL (no encoded width) is not width-checked', async () => {
  const buffer = await createSolidImageBuffer(50, 50);
  const url = 'https://upload.wikimedia.org/wikipedia/commons/a/b/x.jpg';
  const result = await verifyDownloadedImage(buffer, { sourceUrl: url });
  assert.equal(result.ok, true);
});

test('reports hasAlpha for alpha-bearing input', async () => {
  const buffer = await createSolidImageBuffer(50, 50, { alpha: true });
  const result = await verifyDownloadedImage(buffer);
  assert.equal(result.ok, true);
  assert.equal(result.hasAlpha, true);
});
