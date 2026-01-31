
import sharp from "sharp";
import { getFetch } from "./fetchUtils.js";
import { StringUtils } from "./stringUtils.js";

const _imgCache = new Map();

export class ImageUtils {
  static async optimizeImageToDataUrl(url, options = {}) {
    const urlStr = StringUtils.safeTrim(url);
    if (!urlStr) return null;

    const key = `${urlStr}::${JSON.stringify(options || {})}`;
    if (_imgCache.has(key)) return _imgCache.get(key);

    try {
      const fetch = await getFetch();
      const response = await fetch(urlStr);
      
      if (!response.ok) {
        throw new Error(`Fetch failed with status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      const {
        width = null,
        height = null,
        fit = "cover",
        quality = 60,
      } = options;

      let pipeline = sharp(inputBuffer);
      
      if (width || height) {
        pipeline = pipeline.resize({
          width: width || null,
          height: height || null,
          fit,
          withoutEnlargement: true,
        });
      }

      const outputBuffer = await pipeline
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      const dataUrl = `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
      _imgCache.set(key, dataUrl);
      
      return dataUrl;
    } catch (error) {
      console.warn(`Image optimization failed for ${urlStr}:`, error.message);
      _imgCache.set(key, urlStr);
      return urlStr;
    }
  }

  static async optimizeLayoutImages(layout) {
    const [header, footer, cover, last] = await Promise.all([
      layout?.headerImg ? this.optimizeImageToDataUrl(layout.headerImg, {
        width: 1400,
        height: 140,
        quality: 60,
        fit: "cover",
      }) : null,
      
      layout?.footerImg ? this.optimizeImageToDataUrl(layout.footerImg, {
        width: 1400,
        height: 120,
        quality: 60,
        fit: "cover",
      }) : null,
      
      layout?.frontPageLastImg ? this.optimizeImageToDataUrl(layout.frontPageLastImg, {
        width: 1240,
        height: 1754,
        quality: 60,
        fit: "cover",
      }) : null,
      
      layout?.lastPageImg ? this.optimizeImageToDataUrl(layout.lastPageImg, {
        width: 1240,
        height: 1754,
        quality: 60,
        fit: "cover",
      }) : null,
    ]);

    return { header, footer, cover, last };
  }
}