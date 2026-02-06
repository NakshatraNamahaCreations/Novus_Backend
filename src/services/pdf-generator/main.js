// main.js - ENHANCED VERSION with signature debugging
// ✅ Larger font sizes
// ✅ Better signature handling (FIXED signatureImg)
// ✅ Debugging for signature issues

import { PatientService } from "./services/patientService.js";
import { SignatureService } from "./services/signatureService.js";
import { ImageUtils } from "./utils/imageUtils.js";
import { generateSingleImagePagePdf, PdfProcessor } from "./processors/pdfProcessor.js";
import { PdfUtils } from "./utils/pdfUtils.js";
import { PageProcessor } from "./processors/pageProcessor.js";
import { PatientHeader } from "./html-generators/patientHeader.js";
import { PathologyTable } from "./html-generators/pathologyTable.js";
import { RadiologyContent } from "./html-generators/radiologyContent.js";
import { Styles } from "./html-generators/styles.js";
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
    if (!rawResults.length) throw new Error("No test results found");

    console.log(`Found ${rawResults.length} test results`);

    // 2) Augment with signatures
    const categoryIds = rawResults
      .map((r) => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);

    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const resultsWithSigs = await SignatureService.augmentResultsWithSignatures(
      rawResults,
      defaultSignatures
    );

    // ✅ Debug signature data
    console.log("=== SIGNATURE DEBUG ===");
    resultsWithSigs.forEach((result, idx) => {
      console.log(`Test ${idx}: ${result.test?.name}`);
      console.log(
        "  Left:",
        result.sigLeft
          ? {
              name: result.sigLeft.name,
              hasSignatureImg: Boolean(result.sigLeft.signatureImg),
              signatureImgLength: result.sigLeft.signatureImg?.length || 0,
            }
          : "null"
      );
      console.log(
        "  Center:",
        result.sigCenter
          ? {
              name: result.sigCenter.name,
              hasSignatureImg: Boolean(result.sigCenter.signatureImg),
              signatureImgLength: result.sigCenter.signatureImg?.length || 0,
            }
          : "null"
      );
      console.log(
        "  Right:",
        result.sigRight
          ? {
              name: result.sigRight.name,
              hasSignatureImg: Boolean(result.sigRight.signatureImg),
              signatureImgLength: result.sigRight.signatureImg?.length || 0,
            }
          : "null"
      );
    });
    console.log("=== END SIGNATURE DEBUG ===");

    // 3) Optimize images
    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    // 4) Create browser
    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      // 5) Plain PDF (NO debug)
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
        debug: false,
      });

      // 6) Letterhead PDF (NO debug)
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
        debug: false,
      });

      // 7) Full PDF (NO debug)
      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        layout,
        optimizedImages,
        debug: false,
      });

      // 8) Compress
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
      console.log("Browser closed");
    }
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
}

/**
 * Generate main PDF (plain or letterhead)
 */
async function generatePdf(options) {
  const {
    browser,
    order,
    patient,
    results,
    mode = "standard",
    headerImg,
    footerImg,
    layout,
    debug = false,
  } = options;

  console.log(`Generating PDF - mode: ${mode}, debug: ${debug}`);

  // Sort: pathology first
  const resultsSorted = [...results].sort((a, b) => {
    const aIsRad = Boolean(a.reportHtml && String(a.reportHtml).trim());
    const bIsRad = Boolean(b.reportHtml && String(b.reportHtml).trim());
    return Number(aIsRad) - Number(bIsRad);
  });

  // Process results into pages
  const pages = PageProcessor.processResults(resultsSorted, mode);
  console.log(`Processed ${pages.length} pages`);

  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);

  // Generate HTML for each page
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

  // Generate complete HTML document
  const html = generateCompleteHtml(pageContents, {
    headerImg,
    footerImg,
    mode,
    debug,
  });

  return PdfProcessor.generatePdf(browser, html);
}

/**
 * Full PDF with cover and last pages
 */
async function generateFullPdf(options) {
  const { browser, order, patient, results, layout, optimizedImages, debug = false } = options;

  console.log("Generating full PDF...");

  // Main content
  const letterheadPdf = await generatePdf({
    browser,
    order,
    patient,
    results,
    mode: "standard",
    headerImg: optimizedImages.header,
    footerImg: optimizedImages.footer,
    layout,
    debug,
  });

  const pdfBuffers = [];

  // Optional cover
  if (optimizedImages.cover) {
    console.log("Adding cover page...");
    const coverPdf = await generateSingleImagePagePdf(browser, optimizedImages.cover);
    pdfBuffers.push(coverPdf);
  }

  pdfBuffers.push(letterheadPdf);

  // Optional last page
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

/**
 * Generate content for a single page
 * ✅ Unified structure for both radiology and pathology
 */
function generatePageContent(page, options) {
  const { order, patient, refDoctor, partner, layout, isLastOverallPage } = options;

  const isLastPageOfTest = page.chunkIndex === page.chunkCount - 1;

  // Patient header (shows on every page)
  const patientHeader = PatientHeader.generate({
    order,
    patient,
    refBy: refDoctor,
    partner: partner,
    stampImg: layout?.sealImg || null,
    stampCode: layout?.sealCode || "MC-6367",
  });

  // Test title
  const testTitle = PageProcessor.generateTestTitle(page.testName, page.chunkIndex, page.chunkCount);

  // Main content
  let contentHtml = "";
  if (page.isRadiology) {
    contentHtml = RadiologyContent.generateContent(page.reportChunk);
  } else {
    contentHtml = PathologyTable.generate(page.chunk || []);
  }

  // ✅ Signatures (only on last page of THIS test)
  let signaturesHtml = "";
  if (isLastPageOfTest) {
    const sigs = {
      left: page.result?.sigLeft || null,
      center: page.result?.sigCenter || null,
      right: page.result?.sigRight || null,
    };

    const hasAnySig = Boolean(sigs.left || sigs.center || sigs.right);
    if (hasAnySig) {
      signaturesHtml = generateSignatures(sigs);
    }
  }

  // Conditions (only once, on the very last page)
  let conditionsHtml = "";
  if (isLastPageOfTest && isLastOverallPage) {
    conditionsHtml = generateConditions();
  }

  return `
    <div class="page">
      ${patientHeader}
      <div class="test-name">${testTitle}</div>
      ${contentHtml}
      ${signaturesHtml}
      ${conditionsHtml}
    </div>
  `;
}

/**
 * ✅ FIXED Generate signatures section
 * - Uses signatureImg correctly
 * - Keeps 3 fixed cells (left/center/right)
 * - Alignment reads sig.alignment too
 */
function generateSignatures(signatures) {
  const slots = [
    { key: "left", fallbackAlign: "left" },
    { key: "center", fallbackAlign: "center" },
    { key: "right", fallbackAlign: "right" },
  ];

  const hasAnySig = Boolean(signatures?.left || signatures?.center || signatures?.right);
  if (!hasAnySig) {
    console.log("⚠️ No signatures found");
    return "";
  }

  const cellHtml = slots
    .map(({ key, fallbackAlign }) => {
      const sig = signatures?.[key];

      // ✅ IMPORTANT: your object has `signatureImg`
      const imageUrl =
        sig?.imageUrl ||
        sig?.signatureImg || // ✅ FIX
        sig?.signatureUrl ||
        sig?.signatureImage ||
        sig?.image ||
        sig?.signature ||
        sig?.url;

      // alignment could be "LEFT"/"RIGHT"/"CENTER"
      const align =
        (sig?.alignment ? String(sig.alignment).toLowerCase() : "") ||
        sig?.position ||
        fallbackAlign;

      console.log(`Signature slot=${key}`, {
        name: sig?.name,
        align,
        hasImageUrl: Boolean(imageUrl),
        keys: sig ? Object.keys(sig) : null,
        imageUrlPreview: imageUrl ? String(imageUrl).slice(0, 60) + "..." : null,
      });

      return `
        <div class="sig-cell ${align}">
          ${
            imageUrl
              ? `
                <div class="sig-img-wrap">
                  <img
                    src="${imageUrl}"
                    alt="Signature of ${sig?.name || "Doctor"}"
                    class="sig-img"
                  />
                </div>
              `
              : `<div class="sig-placeholder"></div>`
          }
          <div class="sig-name">${sig?.name || ""}</div>
          <div class="sig-desig">${sig?.designation || ""}</div>
        </div>
      `;
    })
    .join("");

  return `<div class="sig-row cols-3">${cellHtml}</div>`;
}

/**
 * Generate conditions section
 */
function generateConditions() {
  return `
    <div class="conditions">
      <div class="conditions-title">CONDITIONS OF LABORATORY TESTING & REPORTING</div>
      <ul class="conditions-list">
        <li>All reports are subject to the terms and conditions specified by Novus Health Labs.</li>
        <li>This is a computer-generated report and does not require a physical signature.</li>
        <li>Results are valid for diagnostic purposes only.</li>
      </ul>
    </div>
  `;
}

/**
 * Generate complete HTML document
 */
function generateCompleteHtml(pageContents, options) {
  const { headerImg, footerImg, mode = "standard", debug = false } = options;

  // Generate CSS with debug flag
  const css = Styles.generate({
    headerH: CONFIG.DIMENSIONS.headerHeight,
    footerH: CONFIG.DIMENSIONS.footerHeight,
    sigH: CONFIG.DIMENSIONS.signatureHeight,
    fontPx: CONFIG.FONT_SIZES.base,
    debug,
  });

  const headerClass = headerImg ? "header" : "header blank";
  const footerClass = footerImg ? "footer" : "footer blank";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Medical Report</title>
        <style>${css}</style>
      </head>
      <body class="${mode}-mode">
        <div class="${headerClass}">
          ${headerImg ? `<img src="${headerImg}" alt="Header" />` : ""}
        </div>

        <div class="${footerClass}">
          ${footerImg ? `<img src="${footerImg}" alt="Footer" />` : ""}
        </div>

        ${pageContents}
      </body>
    </html>
  `;
}
