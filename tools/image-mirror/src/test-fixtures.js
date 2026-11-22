// Tiny synthetic image builders for the test suite, so tests never need to
// hit the network or check in binary fixtures. Lives under src/ (not
// test/) so bare `import sharp from 'sharp'` resolves against this
// package's own node_modules regardless of which directory imports it.
import sharp from 'sharp';

export async function createSolidImageBuffer(width, height, { alpha = false } = {}) {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 10, g: 20, b: 30, alpha: 0.5 } : { r: 10, g: 20, b: 30 },
    },
  });
  return alpha ? image.png().toBuffer() : image.jpeg().toBuffer();
}
