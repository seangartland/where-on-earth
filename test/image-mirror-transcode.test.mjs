import assert from 'node:assert/strict';
import test from 'node:test';

import { planVariantWidths, TARGET_WIDTHS, encodeWebpVariant, verifyEncodedVariant, sha256 } from '../tools/image-mirror/src/transcode.js';
import { createSolidImageBuffer } from '../tools/image-mirror/src/test-fixtures.js';

test('planVariantWidths never upscales: a source narrower than a target widths is capped to the source width', () => {
  const plan = planVariantWidths(400);
  assert.deepEqual(plan, [
    { target: 256, encodeWidth: 256 },
    { target: 640, encodeWidth: 400 },
    { target: 1280, encodeWidth: 400 },
  ]);
});

test('planVariantWidths covers all three approved target widths when the source is large enough', () => {
  const plan = planVariantWidths(2000);
  assert.deepEqual(plan.map((p) => p.target), TARGET_WIDTHS);
  assert.deepEqual(plan.map((p) => p.encodeWidth), [256, 640, 1280]);
});

test('encodeWebpVariant resizes to the requested width and never enlarges', async () => {
  const source = await createSolidImageBuffer(800, 400);
  const variant = await encodeWebpVariant(source, 256);
  assert.equal(variant.format, 'webp');
  assert.equal(variant.width, 256);
  assert.equal(variant.height, 128);
  assert.ok(variant.bytes > 0);
  assert.equal(variant.sha256, sha256(variant.data));
});

test('encodeWebpVariant with encodeWidth equal to the source width does not resize', async () => {
  const source = await createSolidImageBuffer(300, 200);
  const variant = await encodeWebpVariant(source, 300);
  assert.equal(variant.width, 300);
  assert.equal(variant.height, 200);
});

test('alpha-bearing input is encoded lossless', async () => {
  const source = await createSolidImageBuffer(100, 100, { alpha: true });
  const variant = await encodeWebpVariant(source, 100);
  assert.equal(variant.lossless, true);
});

test('opaque input is encoded lossy at the pinned quality', async () => {
  const source = await createSolidImageBuffer(100, 100);
  const variant = await encodeWebpVariant(source, 100);
  assert.equal(variant.lossless, false);
});

test('verifyEncodedVariant accepts a correctly-encoded variant', async () => {
  const source = await createSolidImageBuffer(800, 400);
  const variant = await encodeWebpVariant(source, 256);
  const check = await verifyEncodedVariant(variant.data, { sourceWidth: 800, sourceHeight: 400, encodeWidth: 256 });
  assert.equal(check.ok, true);
  assert.equal(check.width, 256);
});

test('verifyEncodedVariant rejects enlargement past the requested encode width', async () => {
  const source = await createSolidImageBuffer(800, 400);
  const variant = await encodeWebpVariant(source, 640); // actually encodes at 640
  // Pretend the caller asked for only 256 (encodeWidth) but got a 640-wide buffer.
  const check = await verifyEncodedVariant(variant.data, { sourceWidth: 800, sourceHeight: 400, encodeWidth: 256 });
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'enlarged');
});

test('verifyEncodedVariant rejects an aspect-ratio mismatch', async () => {
  // A square 200x200 webp "pretending" to be an encode of a 800x400 (2:1) source.
  const square = await createSolidImageBuffer(200, 200);
  const variant = await encodeWebpVariant(square, 200);
  const check = await verifyEncodedVariant(variant.data, { sourceWidth: 800, sourceHeight: 400, encodeWidth: 200 });
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'aspect-mismatch');
});
