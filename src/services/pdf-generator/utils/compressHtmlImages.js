// utils/compressHtmlImages.js
// Finds all base64 images embedded in Quill/HTML content and compresses them via sharp.
// Typical reduction: 5 MB → 600 KB for reports with 2–3 radiology images.

import sharp from "sharp";

const MAX_WIDTH  = 1200;   // px — enough for A4 print at 150 dpi
const MAX_HEIGHT = 1600;   // px
const JPEG_QUALITY = 72;   // 60–80 is the sweet spot

/**
 * Compress a single base64 data-URL image.
 * Converts everything (PNG, WEBP, GIF…) to JPEG unless it's already a tiny JPEG.
 */
async function compressDataUrl(dataUrl) {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return dataUrl;

    const [, mime, b64] = match;
    const inputBuf = Buffer.from(b64, "base64");

    // Skip tiny images — not worth re-encoding (< 10 KB)
    if (inputBuf.length < 10_000) return dataUrl;

    const compressed = await sharp(inputBuf)
      .rotate()                          // respect EXIF orientation
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // Only use the compressed version if it's actually smaller
    if (compressed.length >= inputBuf.length) return dataUrl;

    return `data:image/jpeg;base64,${compressed.toString("base64")}`;
  } catch {
    // If sharp can't handle it (SVG, etc.) just return original
    return dataUrl;
  }
}

/**
 * Walk through an HTML string, find every embedded base64 image,
 * compress it, and return the updated HTML.
 *
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function compressHtmlImages(html) {
  if (!html) return html;

  // Collect all unique data-URLs to avoid compressing duplicates twice
  const pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  const unique = [...new Set(html.match(pattern) || [])];

  if (!unique.length) return html;

  // Compress all in parallel
  const compressed = await Promise.all(unique.map(compressDataUrl));

  // Replace each original with its compressed version
  let result = html;
  for (let i = 0; i < unique.length; i++) {
    if (unique[i] !== compressed[i]) {
      // Escape special regex chars in the original data-url before replacing
      result = result.split(unique[i]).join(compressed[i]);
    }
  }

  return result;
}