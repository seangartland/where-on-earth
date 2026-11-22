const WIKI_HOST_RE = /^https?:\/\/(thumb|upload|commons)\.wikimedia\.org\//i;
const THUMB_WIDTH_RE = /\/(\d+)px-[^/]+$/;

export function isWikimediaImageUrl(value) {
  return typeof value === 'string' && WIKI_HOST_RE.test(value);
}

export function wikimediaHost(url) {
  return new URL(url).hostname.toLowerCase();
}

// Wikimedia thumbnail paths encode the requested render width, e.g.
// ".../thumb/.../1280px-Name.jpg". Returns null when the URL has no such
// segment (full-resolution upload.wikimedia.org links, commons description
// pages, etc).
export function encodedThumbWidth(url) {
  const match = THUMB_WIDTH_RE.exec(new URL(url).pathname);
  return match ? Number(match[1]) : null;
}
