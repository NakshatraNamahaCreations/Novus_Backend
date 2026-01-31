// utils/pdfUtils.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDF_SETTINGS } from "../config/constants.js";

const execFileAsync = promisify(execFile);

export class PdfUtils {
  static async compressPdfBuffer(inputBuffer, preset = PDF_SETTINGS.COMPRESSION_PRESET) {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-"));
      const inputPath = path.join(tmpDir, "input.pdf");
      const outputPath = path.join(tmpDir, "output.pdf");
      
      await fs.writeFile(inputPath, inputBuffer);

      await execFileAsync("gs", [
        "-sDEVICE=pdfwrite",
        `-dCompatibilityLevel=${PDF_SETTINGS.COMPATIBILITY_LEVEL}`,
        `-dPDFSETTINGS=${preset}`,
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sColorImageDownsampleType=${PDF_SETTINGS.IMAGE_DOWNSAMPLE_TYPE}`,
        `-dColorImageResolution=${PDF_SETTINGS.IMAGE_RESOLUTION}`,
        `-sOutputFile=${outputPath}`,
        inputPath,
      ]);

      const compressedBuffer = await fs.readFile(outputPath);
      await fs.rm(tmpDir, { recursive: true, force: true });
      
      return compressedBuffer;
    } catch (error) {
      console.warn("PDF compression failed, returning original buffer:", error.message);
      return inputBuffer;
    }
  }

  static async mergePdfs(pdfBuffers) {
    const { PDFDocument } = await import("pdf-lib");
    const mergedPdf = await PDFDocument.create();

    for (const buffer of pdfBuffers) {
      if (!buffer) continue;
      
      const pdf = await PDFDocument.load(buffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    return await mergedPdf.save({ useObjectStreams: true });
  }

  static async renderPdfFromHtml(browser, html, options = {}) {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1240,
      height: 1754,
      deviceScaleFactor: 2,
    });

    await page.setContent(html, {
      waitUntil: ["networkidle0", "domcontentloaded"],
    });

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      scale: 1,
      ...options,
    });

    await page.close();
    return pdf;
  }
}