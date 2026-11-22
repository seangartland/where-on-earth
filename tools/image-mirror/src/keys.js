// Key scheme per docs/image-r2-mirror-design.md:
// photos/v1/sha256/<source-sha256>/w<width>.webp
export const KEY_VERSION = 'v1';

export function variantKey(sourceSha256, width) {
  return `photos/${KEY_VERSION}/sha256/${sourceSha256}/w${width}.webp`;
}

export function mirroredUrl(sourceSha256, width, host = 'images.where-on.earth') {
  return `https://${host}/${variantKey(sourceSha256, width)}`;
}
