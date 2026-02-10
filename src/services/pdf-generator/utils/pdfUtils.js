// utils/pdfUtils.js

import { PDFDocument } from "pdf-lib";

export class PdfUtils {
  static async mergePdfs(buffers) {
    try {
      const outDoc = await PDFDocument.create();

      for (const b of buffers || []) {
        if (!b) continue;
        const src = await PDFDocument.load(b);
        const pages = await outDoc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => outDoc.addPage(p));
      }

      const merged = await outDoc.save();
      return Buffer.from(merged);
    } catch (e) {
      console.error("PdfUtils.mergePdfs error:", e);
      throw e;
    }
  }

  static async compressPdfBuffer(buf) {
    try {
      // ✅ optional: if you want real compression, use ghostscript in server
      // for now safe fallback:
      return Buffer.from(buf);
    } catch (e) {
      console.error("PdfUtils.compressPdfBuffer error:", e);
      return Buffer.from(buf);
    }
  }
}
