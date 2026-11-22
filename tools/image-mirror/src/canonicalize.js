// Canonicalization per docs/image-r2-mirror-design.md: strip the fragment and
// any query parameter whose key starts with "utm_" (case-insensitive). Nothing
// else about the URL is touched -- the path and remaining query string can
// select different bytes on Wikimedia's thumbnail renderer, so they are kept
// as exact text rather than being re-parsed/re-encoded.

function isUtmKey(rawKey) {
  const decoded = decodeURIComponent(rawKey.replace(/\+/g, ' ')).toLowerCase();
  return decoded.startsWith('utm_');
}

export function canonicalizeUrl(rawUrl) {
  const hashIndex = rawUrl.indexOf('#');
  const withoutFragment = hashIndex === -1 ? rawUrl : rawUrl.slice(0, hashIndex);

  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex === -1) return withoutFragment;

  const base = withoutFragment.slice(0, queryIndex);
  const query = withoutFragment.slice(queryIndex + 1);
  if (query === '') return base;

  const kept = query.split('&').filter((pair) => {
    const key = pair.split('=')[0];
    return !isUtmKey(key);
  });

  return kept.length ? `${base}?${kept.join('&')}` : base;
}
