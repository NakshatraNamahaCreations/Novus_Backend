// main.js (COMPLETE COPY-PASTE)
// ✅ Output:
// 1) Plain PDF (no header/footer)
// 2) Letterhead PDF (with header/footer)
// 3) Full PDF (optional cover + letterhead + optional last)
// ✅ Signatures:
// - Show signatures ONLY on the LAST page of each test (radiology + pathology)
// ✅ Conditions:
// - Show CONDITIONS only once, on the LAST overall page, directly AFTER the signatures
//   (same page; will auto-break only if content overflows)

import { PatientService } from "./services/patientService.js";
import { SignatureService } from "./services/signatureService.js";
import { TrendService } from "./services/trendService.js";
import { ImageUtils } from "./utils/imageUtils.js";
import { generateSingleImagePagePdf, PdfProcessor } from "./processors/pdfProcessor.js";
import { PdfUtils } from "./utils/pdfUtils.js";
import { PageProcessor } from "./processors/pageProcessor.js";
import { PatientHeader } from "./html-generators/patientHeader.js";
import { PathologyTable } from "./html-generators/pathologyTable.js";
import { RadiologyContent } from "./html-generators/radiologyContent.js";
import { SignatureSection } from "./html-generators/signatureSection.js";
import { Styles } from "./html-generators/styles.js";
import { ConditionsSection } from "./html-generators/conditionsSection.js";
import { CONFIG } from "./config/constants.js";

export async function generatePatient3PdfsNew({ orderId, patientId }) {
  try {
    console.log(`Starting PDF generation for Order: ${orderId}, Patient: ${patientId}`);

    // 1) Fetch Data
    const [order, patient, layout, rawResults] = await Promise.all([
      PatientService.getOrderData(orderId),
      PatientService.getPatientData(patientId),
      PatientService.getLayoutData(),
      PatientService.getPatientResults(orderId, patientId),
    ]);

    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!patient) throw new Error(`Patient ${patientId} not found`);
    if (!rawResults.length) throw new Error("No test results found for this patient");

    console.log(`Found ${rawResults.length} test results for patient`);
    console.log(
      "RAW RESULTS TESTS:",
      rawResults.map((r) => ({
        id: r.id,
        testId: r.testId,
        testName: r.test?.name,
        patientId: r.patientId,
        orderMemberId: r.orderMemberId,
        params: (r.parameterResults || []).length,
        hasHtml: Boolean(r.reportHtml && String(r.reportHtml).trim()),
      }))
    );

    // 2) Signatures: defaults + attach into each result (sigLeft/sigCenter/sigRight)
    const categoryIds = rawResults
      .map((r) => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);

    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const resultsWithSigs = await SignatureService.augmentResultsWithSignatures(
      rawResults,
      defaultSignatures
    );

    // 3) Optimize Images (header/footer/cover/last)
    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    // 4) Browser
    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      // 5) Plain PDF
      console.log("Generating plain PDF...");
      const plainPdf = await generatePdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        mode: "standard",
        headerImg: null,
        footerImg: null,
        layout,
      });

      // 6) Letterhead PDF
      console.log("Generating letterhead PDF...");
      const letterheadPdf = await generatePdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        mode: "standard",
        headerImg: optimizedImages.header,
        footerImg: optimizedImages.footer,
        layout,
      });

      // 7) Full PDF (cover + letterhead + last)
      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        layout,
        optimizedImages,
      });

      // 8) Compress PDFs (if gs missing -> returns original)
      console.log("Compressing PDFs...");
      const [plainCompressed, letterheadCompressed, fullCompressed] = await Promise.all([
        PdfUtils.compressPdfBuffer(Buffer.from(plainPdf)),
        PdfUtils.compressPdfBuffer(Buffer.from(letterheadPdf)),
        PdfUtils.compressPdfBuffer(Buffer.from(fullPdf)),
      ]);

      console.log("PDF generation completed successfully");

      return {
        plainBuffer: plainCompressed,
        letterheadBuffer: letterheadCompressed,
        fullBuffer: fullCompressed,
      };
    } finally {
      await browser.close();
      console.log("Browser instance closed");
    }
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
}

/* -------------------------------------------------------
   ✅ Generate main PDF (plain / letterhead)
   - Sort pathology first (optional)
   - Creates pages from PageProcessor
   - Adds signatures only on last page of each test
   - Adds conditions ONLY ONCE (last overall page) after signatures
------------------------------------------------------- */
async function generatePdf(options) {
  const { browser, order, patient, results, mode = "standard", headerImg, footerImg, layout } =
    options;

  console.log(`Generating PDF with mode: ${mode}`);

  // Optional: pathology first, radiology later
  const resultsSorted = [...results].sort((a, b) => {
    const aIsRad = Boolean(a.reportHtml && String(a.reportHtml).trim());
    const bIsRad = Boolean(b.reportHtml && String(b.reportHtml).trim());
    return Number(aIsRad) - Number(bIsRad);
  });

  const pages = PageProcessor.processResults(resultsSorted, mode);
  console.log(`Processed ${pages.length} pages from ${resultsSorted.length} results`);

  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);

  const pageContents = pages
    .map((page, idx) =>
      generatePageContent(page, {
        order,
        patient,
        refDoctor,
        partner,
        layout,
        mode,
        isLastOverallPage: idx === pages.length - 1,
      })
    )
    .join("");

  const html = generateCompleteHtml(pageContents, {
    headerImg,
    footerImg,
    reserveHeaderFooterSpace: true,
    mode,
  });

  return PdfProcessor.generatePdf(browser, html);
}

/* -------------------------------------------------------
   ✅ Full PDF: optional cover + letterhead + optional last
------------------------------------------------------- */
async function generateFullPdf(options) {
  const { browser, order, patient, results, layout, optimizedImages } = options;

  console.log("Generating full PDF (letterhead + cover/last pages)...");

  // Letterhead (includes signatures + conditions logic inside)
  const letterheadPdf = await generatePdf({
    browser,
    order,
    patient,
    results,
    mode: "standard",
    headerImg: optimizedImages.header,
    footerImg: optimizedImages.footer,
    layout,
  });

  const pdfBuffers = [];

  // Cover page (optional)
  if (optimizedImages.cover) {
    console.log("Adding cover page...");
    const coverPdf = await generateSingleImagePagePdf(browser, optimizedImages.cover);
    pdfBuffers.push(coverPdf);
  }

  // Main content
  console.log("Adding letterhead content...");
  pdfBuffers.push(letterheadPdf);

  // Last page (optional)
  if (optimizedImages.last) {
    console.log("Adding last page...");
    const lastPdf = await generateSingleImagePagePdf(browser, optimizedImages.last);
    pdfBuffers.push(lastPdf);
  }

  if (pdfBuffers.length > 1) {
    console.log(`Merging ${pdfBuffers.length} PDFs...`);
    return PdfUtils.mergePdfs(pdfBuffers);
  }

  return letterheadPdf;
}

/* -------------------------------------------------------
   ✅ One page content
   - normal test content
   - signatures ONLY on last page of this test
   - conditions ONLY once at the very end (after signatures)
------------------------------------------------------- */
function generatePageContent(page, options) {
  const { order, patient, refDoctor, partner, layout, mode, isLastOverallPage } = options;

  const testTitle = PageProcessor.generateTestTitle(page.testName, page.chunkIndex, page.chunkCount);

  const patientHeader = PatientHeader.generate({
    order,
    patient,
    refBy: refDoctor,
    partner: partner,
    stampImg: layout?.sealImg || null,
    stampCode: layout?.sealCode || "MC-6367",
  });

  let content = `
    ${patientHeader}
    <div class="test-name">${testTitle}</div>
  `;

  if (page.isRadiology) {
    content += RadiologyContent.generateContent(page.reportChunk);
  } else {
    // (Optional trends not enabled in this version)
    content += PathologyTable.generate(page.chunk || []);
  }

  // ✅ Signatures only on last page of this test
  const isLastPageOfThisTest = page.chunkIndex === page.chunkCount - 1;

  // IMPORTANT: you store augmented signatures as sigLeft/sigCenter/sigRight
  const signatures = {
    left:
      page.result?.leftSignature ||
      page.result?.sigLeft ||
      null,
    center:
      page.result?.centerSignature ||
      page.result?.sigCenter ||
      null,
    right:
      page.result?.rightSignature ||
      page.result?.sigRight ||
      null,
  };

  // ✅ render signature row only if at least one signature exists
  const hasAnySig = Boolean(signatures.left || signatures.center || signatures.right);
  const signatureHtml = isLastPageOfThisTest && hasAnySig ? SignatureSection.generate(signatures) : "";

  // ✅ Conditions ONLY once, only after the last test's last page
  const conditionsHtml =
    isLastPageOfThisTest && isLastOverallPage ? ConditionsSection.generate() : "";

  return `
    <div class="page">
      <div class="page-content">
        ${content}
        ${signatureHtml}
        ${conditionsHtml}
      </div>
    </div>
  `;
}

/* -------------------------------------------------------
   ✅ Full HTML wrapper
------------------------------------------------------- */
function generateCompleteHtml(pageContents, options) {
  const { headerImg, footerImg, reserveHeaderFooterSpace, mode } = options;

  const css = Styles.generate({
    headerH: reserveHeaderFooterSpace
      ? CONFIG.DIMENSIONS.headerHeight
      : headerImg
      ? CONFIG.DIMENSIONS.headerHeight
      : 0,
    footerH: reserveHeaderFooterSpace
      ? CONFIG.DIMENSIONS.footerHeight
      : footerImg
      ? CONFIG.DIMENSIONS.footerHeight
      : 0,
    // NOTE: signature is NOT fixed, so keep sigH 0 (avoid reserved space)
    sigH: 0,
    fontPx: CONFIG.FONT_SIZES.base,
  });

  const headerClass = headerImg ? "header" : "header blank";
  const footerClass = footerImg ? "footer" : "footer blank";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="page-number" content="counter(page) of counter(pages)">
        ${css}
      </head>
      <body class="${mode}-mode">
        <div class="${headerClass}">
          ${headerImg ? `<img src="${headerImg}" alt="header" />` : ""}
        </div>

        <div class="${footerClass}">
          ${footerImg ? `<img src="${footerImg}" alt="footer" />` : ""}
        </div>

        <div class="page-number"></div>

        ${pageContents}
      </body>
    </html>
  `;
}
