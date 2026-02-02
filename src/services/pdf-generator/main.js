
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

import { 
  calculateAge,
  formatShortDate,
  formatDateTime 
} from "./utils/dateUtils.js";
import { CONFIG } from "./config/constants.js";

export async function generatePatient3PdfsNew({ orderId, patientId }) {
  try {
    console.log(`Starting PDF generation for Order: ${orderId}, Patient: ${patientId}`);
    
    // 1. Fetch Data
    const [order, patient, layout, rawResults] = await Promise.all([
      PatientService.getOrderData(orderId),
      PatientService.getPatientData(patientId),
      PatientService.getLayoutData(),
      PatientService.getPatientResults(orderId, patientId)
    ]);

    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!patient) throw new Error(`Patient ${patientId} not found`);
    if (!rawResults.length) throw new Error("No test results found for this patient");

    console.log(`Found ${rawResults.length} test results for patient`);

    // 2. Process Signatures
    const categoryIds = rawResults
      .map(r => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);
    
    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const results = await SignatureService.augmentResultsWithSignatures(rawResults, defaultSignatures);

    // 3. Optimize Images
    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    // 4. Create Browser Instance
    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      // 5. Generate Plain PDF (without header/footer)
      console.log("Generating plain PDF...");
      const plainPdf = await generatePdf({
        browser,
        order,
        patient,
        results,
        mode: "standard",
        trendMap: null,
        headerImg: null,
        footerImg: null,
        layout
      });

      // 6. Generate Letterhead PDF (with header/footer)
      console.log("Generating letterhead PDF...");
      const letterheadPdf = await generatePdf({
        browser,
        order,
        patient,
        results,
        mode: "standard",
        trendMap: null,
        headerImg: optimizedImages.header,
        footerImg: optimizedImages.footer,
        layout
      });

      // 7. Generate Full PDF (cover + letterhead + last page)
      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results,
        trendMap: null, // No trends needed
        layout,
        optimizedImages
      });

      // 8. Compress PDFs
      console.log("Compressing PDFs...");
      const [plainCompressed, letterheadCompressed, fullCompressed] = await Promise.all([
        PdfUtils.compressPdfBuffer(Buffer.from(plainPdf)),
        PdfUtils.compressPdfBuffer(Buffer.from(letterheadPdf)),
        PdfUtils.compressPdfBuffer(Buffer.from(fullPdf))
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

async function generatePdf(options) {
  const {
    browser,
    order,
    patient,
    results,
    mode = "standard", // Only used for row limits, not content differences
    trendMap,
    headerImg,
    footerImg,
    layout
  } = options;

  console.log(`Generating PDF with mode: ${mode}`);
  
  const pages = PageProcessor.processResults(results, mode);
  console.log(`Processed ${pages.length} pages from ${results.length} results`);
  
  // Get reference doctor and partner info
  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);

  const pageContents = pages.map(page => generatePageContent(page, {
    order,
    patient,
    refDoctor,
    partner,
    trendMap: null, // No trends for regular/letterhead PDFs
    layout,
    mode: "standard" // Always standard for regular PDFs
  })).join('');

  const html = generateCompleteHtml(pageContents, {
    headerImg,
    footerImg,
    reserveHeaderFooterSpace: true
  });

  return PdfProcessor.generatePdf(browser, html);
}

async function generateFullPdf(options) {
  const { 
    browser, 
    order, 
    patient, 
    results, 
    trendMap, 
    layout, 
    optimizedImages 
  } = options;

  console.log("Generating full PDF (letterhead + cover/last pages)...");

  // Generate the SAME content as letterhead PDF
  const letterheadPdf = await generatePdf({
    browser,
    order,
    patient,
    results,
    mode: "standard", // Same mode as letterhead
    trendMap: null,    // No trends (same as letterhead)
    headerImg: optimizedImages.header,
    footerImg: optimizedImages.footer,
    layout
  });

  const pdfBuffers = [];

  // 1. Add cover page if exists
  if (optimizedImages.cover) {
    console.log("Adding cover page...");
    const coverPdf = await generateSingleImagePagePdf(browser, optimizedImages.cover);
    pdfBuffers.push(coverPdf);
  }

  // 2. Add the main letterhead content
  console.log("Adding letterhead content...");
  pdfBuffers.push(letterheadPdf);

  // 3. Add last page if exists
  if (optimizedImages.last) {
    console.log("Adding last page...");
    const lastPdf = await generateSingleImagePagePdf(browser, optimizedImages.last);
    pdfBuffers.push(lastPdf);
  }

  // Only merge if we have multiple pages
  if (pdfBuffers.length > 1) {
    console.log(`Merging ${pdfBuffers.length} PDFs...`);
    return PdfUtils.mergePdfs(pdfBuffers);
  }
  
  // If no cover/last pages, just return the letterhead PDF
  return letterheadPdf;
}


function generatePageContent(page, options) {
  const {
    order,
    patient,
    refDoctor,
    partner,
    trendMap,
    layout,
    mode
  } = options;

  const isFull = mode === "full";
  const testTitle = PageProcessor.generateTestTitle(page.testName, page.chunkIndex, page.chunkCount);
  
  // Get signatures
  const signatures = {
    left: page.result?.leftSignature,
    center: page.result?.centerSignature,
    right: page.result?.rightSignature
  };

  // Generate patient header
  const patientHeader = PatientHeader.generate({
    order,
    patient,
    refBy: refDoctor,
    partner: partner,
    stampImg: layout?.sealImg || null,
    stampCode: layout?.sealCode || "MC-6367"
  });

  let content = `
    ${patientHeader}
    <div class="test-name">${testTitle}</div>
  `;

  let tableHtml = '';
  
  if (page.isRadiology) {
    // Handle radiology content
    content += RadiologyContent.generateContent(page.reportChunk);
  } else {
    // Handle pathology table
    const hasTrends = isFull && trendMap && 
      TrendService.hasAnyTrendsForTest(trendMap, page.testId, page.result.parameterResults);
    
    tableHtml = PathologyTable.generate(page.chunk || []);

    if (hasTrends && page.chunkIndex === 0) {
      // Get trend dates
      const firstParamId = page.result.parameterResults?.[0]?.parameterId;
      const trendDates = ['Previous 1', 'Previous 2', 'Previous 3'];
      
      if (firstParamId) {
        const trends = trendMap.get(`${page.testId}:${firstParamId}`) || [];
        trendDates[0] = formatShortDate(trends[0]?.date) || 'Previous 1';
        trendDates[1] = formatShortDate(trends[1]?.date) || 'Previous 2';
        trendDates[2] = formatShortDate(trends[2]?.date) || 'Previous 3';
      }
      
      const trendsHtml = TrendService.generateTrendsHtml(
        trendMap,
        page.testId,
        page.result.parameterResults,
        trendDates
      );

      content += `
        <div class="two-col">
          <div class="col-main">${tableHtml}</div>
          <div class="col-trend">${trendsHtml}</div>
        </div>
      `;
    } else {
      content += tableHtml;
    }
  }

  const signatureSection = SignatureSection.generate(signatures);
  
  // Add mode-specific class to page
  const pageClass = isFull ? 'page full-mode' : 'page';
  
  return `
    <div class="${pageClass}">
      <div class="page-content">${content}</div>
      ${signatureSection}
    </div>
  `;
}

function generateCompleteHtml(pageContents, options) {
  const { headerImg, footerImg, reserveHeaderFooterSpace, mode } = options;
  
  // Calculate dimensions based on mode
  const isFull = mode === 'full';
  const sigH = isFull ? CONFIG.DIMENSIONS.signatureHeight + 20 : CONFIG.DIMENSIONS.signatureHeight;
  
  // Get CSS with correct dimensions
  const css = Styles.generate({
    headerH: reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.headerHeight : headerImg ? CONFIG.DIMENSIONS.headerHeight : 0,
    footerH: reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.footerHeight : footerImg ? CONFIG.DIMENSIONS.footerHeight : 0,
    sigH: sigH,
    fontPx: CONFIG.FONT_SIZES.base
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
          ${headerImg ? `<img src="${headerImg}" alt="header" />` : ''}
        </div>
        <div class="${footerClass}">
          ${footerImg ? `<img src="${footerImg}" alt="footer" />` : ''}
        </div>
        <div class="page-number"></div>
        ${pageContents}
      </body>
    </html>
  `;
}