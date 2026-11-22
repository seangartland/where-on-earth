import { createHash } from 'node:crypto';

import sharp from 'sharp';

// Decision 4: physical-pixel widths, approved 2026-11-22.
export const TARGET_WIDTHS = [256, 640, 1280];

// Never upscale: a target wider than the source is encoded at the source's
// own width instead (design: "encode the original dimensions but keep the
// requested key and record actual_width/actual_height").
export function planVariantWidths(sourceWidth, targetWidths = TARGET_WIDTHS) {
  return targetWidths.map((target) => ({
    target,
    encodeWidth: Math.min(target, sourceWidth),
  }));
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// Encodes one width as WebP. Alpha-bearing input stays lossless (flattening
// would change the image); everything else uses the pinned quality below.
// Quality 82 is this build's pinned v1 default -- the design calls for a
// value "selected by the preflight visual sample", which needs a human
// visual review this scripted preflight cannot perform; see
// R2-BUILD-REPORT.md's flagged-ambiguities section.
export const PINNED_WEBP_QUALITY = 82;

export async function encodeWebpVariant(sourceBuffer, encodeWidth, { quality = PINNED_WEBP_QUALITY } = {}) {
  const probe = await sharp(sourceBuffer).metadata();
  const hasAlpha = Boolean(probe.hasAlpha);

  let pipeline = sharp(sourceBuffer, { failOn: 'error' }).rotate().toColorspace('srgb');
  if (encodeWidth < (probe.width ?? encodeWidth)) {
    pipeline = pipeline.resize({ width: encodeWidth, withoutEnlargement: true, fit: 'inside' });
  }
  pipeline = hasAlpha ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    format: info.format,
    bytes: data.length,
    sha256: sha256(data),
    lossless: hasAlpha,
  };
}

// Re-decodes an encoded variant and checks format, nonzero dimensions, no
// enlargement past the source, and aspect ratio within rounding tolerance --
// the independent re-verification the design requires after transcode.
export async function verifyEncodedVariant(variantBuffer, { sourceWidth, sourceHeight, encodeWidth }) {
  let metadata;
  try {
    metadata = await sharp(variantBuffer).metadata();
  } catch (err) {
    return { ok: false, reason: 'decode-failed', error: err.message };
  }
  if (metadata.format !== 'webp') return { ok: false, reason: 'wrong-format', format: metadata.format };
  if (!metadata.width || !metadata.height) return { ok: false, reason: 'zero-dimensions' };
  if (metadata.width > encodeWidth) return { ok: false, reason: 'enlarged', width: metadata.width, encodeWidth };

  const sourceAspect = sourceWidth / sourceHeight;
  const outputAspect = metadata.width / metadata.height;
  const aspectTolerance = 0.01; // rounding tolerance for integer pixel dimensions
  if (Math.abs(sourceAspect - outputAspect) > aspectTolerance) {
    return { ok: false, reason: 'aspect-mismatch', sourceAspect, outputAspect };
  }

  return { ok: true, width: metadata.width, height: metadata.height };
}
