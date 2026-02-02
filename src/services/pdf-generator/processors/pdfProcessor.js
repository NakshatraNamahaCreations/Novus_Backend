// processors/pdfProcessor.js
import puppeteer from "puppeteer";
import { PdfUtils } from "../utils/pdfUtils.js";

export class PdfProcessor {
  static async createBrowser() {
    return await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--font-render-hinting=none",
      ],
    });
  }

  static async generatePdf(browser, html, options = {}) {
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

  static async generateSinglePagePdf(browser, html) {
    return this.generatePdf(browser, html, { pageRanges: "1" });
  }

  static async generateFullPageImage(browser, imageUrl) {
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 0; }
            html, body { margin:0; padding:0; width:210mm; height:297mm; overflow:hidden; }
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact; 
              font-family: 'Inter', sans-serif;
            }
            .one-page {
              width: 210mm;
              height: 297mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
              page-break-after: avoid;
              break-after: avoid;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .one-page img {
              max-width: 100%;
              max-height: 100%;
              display: block;
              object-fit: cover;
            }
          </style>
        </head>
        <body>
          <div class="one-page">
            ${imageUrl ? `<img src="${imageUrl}" alt="page" />` : ''}
          </div>
        </body>
      </html>
    `;

    return this.generateSinglePagePdf(browser, html);
  }
  
}

export async function generateSingleImagePagePdf(browser, imageUrl) {
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; height: 100%; }
        img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover; /* use contain if you don't want cropping */
        }
      </style>
    </head>
    <body>
      <img src="${imageUrl}" />
    </body>
  </html>`;

  return PdfProcessor.generatePdf(browser, html, {
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    printBackground: true,
  });
}
