import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeUrl } from '../tools/image-mirror/src/canonicalize.js';

test('strips the fragment', () => {
  assert.equal(
    canonicalizeUrl('https://upload.wikimedia.org/wikipedia/commons/a/b.jpg#/media/File:b.jpg'),
    'https://upload.wikimedia.org/wikipedia/commons/a/b.jpg',
  );
});

test('removes utm_* query parameters case-insensitively, keeps the rest', () => {
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/a.jpg/1280px-a.jpg'
    + '?utm_source=commons.wikimedia.org&UTM_Campaign=imageinfo&keep=1&utm_content=thumbnail';
  assert.equal(
    canonicalizeUrl(url),
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/a.jpg/1280px-a.jpg?keep=1',
  );
});

test('drops the "?" entirely when every param is utm_*', () => {
  const url = 'https://thumb.wikimedia.org/x/1280px-a.jpg?utm_source=a&utm_campaign=b';
  assert.equal(canonicalizeUrl(url), 'https://thumb.wikimedia.org/x/1280px-a.jpg');
});

test('a URL with no query string is returned unchanged (minus any fragment)', () => {
  const url = 'https://upload.wikimedia.org/wikipedia/commons/a/b.jpg';
  assert.equal(canonicalizeUrl(url), url);
});

test('does not touch the path, including percent-encoded and width-bearing thumbnail segments', () => {
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/View_%C5%8Cwakudani.jpg/500px-View_%C5%8Cwakudani.jpg';
  assert.equal(canonicalizeUrl(url), url);
});

test('non-utm query parameters survive untouched, in original order', () => {
  const url = 'https://commons.wikimedia.org/wiki/File:a.jpg?action=raw&width=800';
  assert.equal(canonicalizeUrl(url), url);
});

test('is idempotent', () => {
  const url = 'https://thumb.wikimedia.org/x/1280px-a.jpg?utm_source=a&keep=1#frag';
  const once = canonicalizeUrl(url);
  assert.equal(canonicalizeUrl(once), once);
});
