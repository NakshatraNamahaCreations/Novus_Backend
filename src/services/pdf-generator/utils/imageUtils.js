import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export class ImageUtils {
  static toPrinceSrc(input) {
    try {
      if (!input) return null;
      const s = String(input).trim();

      if (s.startsWith("http://") || s.startsWith("https://")) return s;
      if (s.startsWith("file://")) return s;

      // absolute path (linux/mac/windows) OR relative -> resolve
      const abs = path.isAbsolute(s) ? s : path.resolve(process.cwd(), s);

      if (fs.existsSync(abs)) {
        return pathToFileURL(abs).href; // ✅ correct file:///...
      }

      return s; // maybe served path
    } catch (e) {
      console.error("ImageUtils.toPrinceSrc error:", e);
      return null;
    }
  }

  // ADD THIS METHOD to fix the error
  static async optimizeLayoutImages(layout) {
    try {
      if (!layout) {
        return {
          header: null,
          footer: null,
          cover: null,
          last: null
        };
      }

      return {
        header: this.toPrinceSrc(layout.headerImg),
        footer: this.toPrinceSrc(layout.footerImg),
        cover: this.toPrinceSrc(layout.coverImg),
        last: this.toPrinceSrc(layout.lastImg)
      };
    } catch (error) {
      console.error("optimizeLayoutImages error:", error);
      return {
        header: null,
        footer: null,
        cover: null,
        last: null
      };
    }
  }
}