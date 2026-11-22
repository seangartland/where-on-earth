import sharp from 'sharp';

import { encodedThumbWidth } from './wikimedia.js';

const HTML_SNIFF_BYTES = 1024;

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, HTML_SNIFF_BYTES).toString('utf8').toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

// Decodes and dimension-checks a downloaded source. Content-Type alone is
// never trusted (design step 3): an HTML error page is sniffed and rejected
// before attempting to decode it as an image, decode failures and
// zero-dimension images are rejected, and a Wikimedia thumbnail whose
// decoded width is LARGER than the width encoded in its own URL is rejected
// (a decoded width smaller than the URL's requested width is the documented
// smaller-original behavior and is accepted).
export async function verifyDownloadedImage(buffer, { sourceUrl } = {}) {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'empty-body' };
  }
  if (looksLikeHtml(buffer)) {
    return { ok: false, reason: 'html-error-page' };
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    return { ok: false, reason: 'decode-failed', error: err.message };
  }

  if (!metadata.width || !metadata.height) {
    return { ok: false, reason: 'zero-dimensions' };
  }

  if (sourceUrl) {
    const encodedWidth = encodedThumbWidth(sourceUrl);
    if (encodedWidth != null && metadata.width > encodedWidth) {
      return {
        ok: false,
        reason: 'width-mismatch',
        encodedWidth,
        decodedWidth: metadata.width,
      };
    }
  }

  return {
    ok: true,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    hasAlpha: Boolean(metadata.hasAlpha),
  };
}
