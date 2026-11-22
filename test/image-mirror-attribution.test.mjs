import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commonsFileTitle,
  buildAttributionResult,
  fetchAttributionForCanonicalSources,
  readAttributionCache,
  writeAttributionCacheAtomic,
} from '../tools/image-mirror/src/attribution.js';

test('commonsFileTitle resolves a thumb.wikimedia.org thumbnail path to its source filename', () => {
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Aberdeen_Harbour_Scotland.jpg/1280px-Aberdeen_Harbour_Scotland.jpg';
  assert.equal(commonsFileTitle(url), 'File:Aberdeen_Harbour_Scotland.jpg');
});

test('commonsFileTitle resolves an upload.wikimedia.org original path', () => {
  const url = 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Alice_Springs%2C_2015_%2801%29.JPG';
  assert.equal(commonsFileTitle(url), 'File:Alice_Springs,_2015_(01).JPG');
});

test('commonsFileTitle resolves commons.wikimedia.org Special:Redirect/file links', () => {
  const url = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Asmara%20street.jpg';
  assert.equal(commonsFileTitle(url), 'File:Asmara street.jpg');
});

test('commonsFileTitle resolves commons.wikimedia.org Special:FilePath links, ignoring the query string', () => {
  const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ciudad%20de%20Asunci%C3%B3n%20Paraguay.jpg?width=500';
  assert.equal(commonsFileTitle(url), 'File:Ciudad de Asunción Paraguay.jpg');
});

test('commonsFileTitle resolves a direct commons.wikimedia.org File: page link', () => {
  assert.equal(commonsFileTitle('https://commons.wikimedia.org/wiki/File:Foo.jpg'), 'File:Foo.jpg');
});

test('commonsFileTitle returns null for an unresolvable commons.wikimedia.org page', () => {
  assert.equal(commonsFileTitle('https://commons.wikimedia.org/wiki/Category:Example'), null);
});

test('commonsFileTitle returns null for a non-Wikimedia or malformed URL', () => {
  assert.equal(commonsFileTitle('not a url'), null);
  assert.equal(commonsFileTitle('https://example.com/a.jpg'), null);
});

test('buildAttributionResult succeeds when both license and author are present, stripping HTML from Artist', () => {
  const page = {
    title: 'File:Foo.jpg',
    canonicalurl: 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
    imageinfo: [{
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' },
      },
    }],
  };
  const result = buildAttributionResult(page, { title: 'File:Foo.jpg' });
  assert.deepEqual(result, {
    status: 'ok',
    license: 'CC BY-SA 4.0',
    author: 'Jane Doe',
    attribution: 'Jane Doe / Wikimedia Commons',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
  });
});

test('buildAttributionResult falls back to License and Credit when LicenseShortName/Artist are absent', () => {
  const page = {
    title: 'File:Foo.jpg',
    imageinfo: [{
      extmetadata: {
        License: { value: 'public domain' },
        Credit: { value: 'Some Museum' },
      },
    }],
  };
  const result = buildAttributionResult(page, { title: 'File:Foo.jpg' });
  assert.equal(result.status, 'ok');
  assert.equal(result.license, 'public domain');
  assert.equal(result.author, 'Some Museum');
  assert.equal(result.sourcePageUrl, 'https://commons.wikimedia.org/wiki/File:Foo.jpg');
});

test('buildAttributionResult fails when the Commons page is missing', () => {
  assert.deepEqual(buildAttributionResult(null), { status: 'failed', reason: 'commons-page-missing' });
  assert.deepEqual(buildAttributionResult({ missing: '' }), { status: 'failed', reason: 'commons-page-missing' });
});

test('buildAttributionResult fails when there is no imageinfo', () => {
  assert.deepEqual(buildAttributionResult({ title: 'File:Foo.jpg' }), { status: 'failed', reason: 'no-imageinfo' });
});

test('buildAttributionResult fails when license or author cannot be read -- copying a URL is not a license record', () => {
  const noAuthor = { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }] };
  assert.deepEqual(buildAttributionResult(noAuthor), { status: 'failed', reason: 'missing-attribution-fields' });

  const noLicense = { imageinfo: [{ extmetadata: { Artist: { value: 'Jane' } } }] };
  assert.deepEqual(buildAttributionResult(noLicense), { status: 'failed', reason: 'missing-attribution-fields' });
});

test('fetchAttributionForCanonicalSources: a cache hit (success or failure) never calls fetchBatch', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-attribution-'));
  try {
    const canonicalUrl = 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Cached.jpg';
    writeAttributionCacheAtomic(dir, canonicalUrl, { status: 'failed', reason: 'missing-attribution-fields' });

    let calls = 0;
    const results = await fetchAttributionForCanonicalSources(
      [{ canonicalUrl, exactUrls: [canonicalUrl], memberships: [] }],
      { cacheDir: dir, fetchBatch: async () => { calls += 1; return new Map(); } },
    );

    assert.equal(calls, 0);
    assert.deepEqual(results.get(canonicalUrl), { status: 'failed', reason: 'missing-attribution-fields' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchAttributionForCanonicalSources batches uncached titles, dedupes shared titles, and caches every result', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-attribution-'));
  try {
    const urlA = 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Shared.jpg';
    const urlB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Shared.jpg/640px-Shared.jpg';
    const urlC = 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Other.jpg';
    const sources = [
      { canonicalUrl: urlA, exactUrls: [urlA], memberships: [] },
      { canonicalUrl: urlB, exactUrls: [urlB], memberships: [] },
      { canonicalUrl: urlC, exactUrls: [urlC], memberships: [] },
    ];

    const batchCalls = [];
    const fetchBatch = async (titles) => {
      batchCalls.push(titles);
      const map = new Map();
      for (const title of titles) {
        map.set(title, {
          title,
          canonicalurl: `https://commons.wikimedia.org/wiki/${title}`,
          imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'Author' } } }],
        });
      }
      return map;
    };

    const results = await fetchAttributionForCanonicalSources(sources, { cacheDir: dir, delayMs: 0, fetchBatch });

    // urlA and urlB share the same underlying Commons filename ("Shared.jpg"),
    // so the live title lookup should happen once, not twice.
    const allTitles = batchCalls.flat();
    assert.equal(allTitles.length, 2);
    assert.equal(results.get(urlA).status, 'ok');
    assert.equal(results.get(urlB).status, 'ok');
    assert.equal(results.get(urlC).status, 'ok');

    assert.deepEqual(readAttributionCache(dir, urlC), results.get(urlC));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchAttributionForCanonicalSources marks an unresolvable-filename source as failed without calling fetchBatch for it', async () => {
  const canonicalUrl = 'https://commons.wikimedia.org/wiki/Category:NotAFile';
  let calls = 0;
  const results = await fetchAttributionForCanonicalSources(
    [{ canonicalUrl, exactUrls: [canonicalUrl], memberships: [] }],
    { fetchBatch: async () => { calls += 1; return new Map(); } },
  );
  assert.equal(calls, 0);
  assert.deepEqual(results.get(canonicalUrl), { status: 'failed', reason: 'unresolvable-filename' });
});

test('attribution cache round-trips through writeAttributionCacheAtomic/readAttributionCache', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-attribution-'));
  try {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg';
    assert.equal(readAttributionCache(dir, url), null);
    writeAttributionCacheAtomic(dir, url, { status: 'ok', license: 'CC0', author: 'A', attribution: 'A / Wikimedia Commons', sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' });
    assert.deepEqual(readAttributionCache(dir, url), {
      status: 'ok', license: 'CC0', author: 'A', attribution: 'A / Wikimedia Commons', sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
