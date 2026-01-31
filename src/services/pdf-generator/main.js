// main.js - Updated imports and data handling
import { PatientService } from "./services/patientService.js";
import { SignatureService } from "./services/signatureService.js";
import { TrendService } from "./services/trendService.js";
import { ImageUtils } from "./utils/imageUtils.js";
import { PdfProcessor } from "./processors/pdfProcessor.js";
import { PdfUtils } from "./utils/pdfUtils.js";
import { PageProcessor } from "./processors/pageProcessor.js";
import { PatientHeader } from "./html-generators/patientHeader.js";
import { PathologyTable } from "./html-generators/pathologyTable.js";
import { RadiologyContent } from "./html-generators/radiologyContent.js";
import { SignatureSection } from "./html-generators/signatureSection.js";
import { Styles } from "./html-generators/styles.js";
import { 
  safeTrim, 
  escapeHtml,
  getRefDoctorDisplay 
} from "./utils/stringUtils.js";
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

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    if (!patient) {
      throw new Error(`Patient ${patientId} not found`);
    }
    
    if (!rawResults.length) {
      throw new Error("No test results found for this patient");
    }

    console.log(`Found ${rawResults.length} test results for patient`);

    // 2. Process Signatures
    const categoryIds = rawResults
      .map(r => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);
    
    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const results = await SignatureService.augmentResultsWithSignatures(rawResults, defaultSignatures);

    // 3. Build Trend Map
    const trendMap = await TrendService.buildTrendMap({ results, patientId });

    // 4. Optimize Images
    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    // 5. Create Browser Instance
    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      // 6. Generate Plain PDF (without header/footer)
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

      // 7. Generate Letterhead PDF (with header/footer)
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

      // 8. Generate Full PDF (cover + content with trends + last page)
      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results,
        trendMap,
        layout,
        optimizedImages
      });

      // 9. Compress PDFs
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
    mode,
    trendMap,
    headerImg,
    footerImg,
    layout
  } = options;

  const pages = PageProcessor.processResults(results, mode);
  
  // Get reference doctor and partner info
  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);

  const pageContents = pages.map(page => generatePageContent(page, {
    order,
    patient,
    refDoctor,
    partner,
    trendMap,
    layout,
    mode
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

  const pdfBuffers = [];

  // Add cover page if exists
  if (optimizedImages.cover) {
    console.log("Adding cover page...");
    const coverPdf = await PdfProcessor.generateFullPageImage(browser, optimizedImages.cover);
    pdfBuffers.push(coverPdf);
  }

  // Generate main content with trends
  console.log("Generating main content with trends...");
  const mainPdf = await generatePdf({
    browser,
    order,
    patient,
    results,
    mode: "full",
    trendMap,
    headerImg: optimizedImages.header,
    footerImg: optimizedImages.footer,
    layout
  });
  pdfBuffers.push(mainPdf);

  // Add last page if exists
  if (optimizedImages.last) {
    console.log("Adding last page...");
    const lastPdf = await PdfProcessor.generateFullPageImage(browser, optimizedImages.last);
    pdfBuffers.push(lastPdf);
  }

  // Merge all PDFs
  console.log("Merging PDF pages...");
  const mergedPdf = await PdfUtils.mergePdfs(pdfBuffers);
  return mergedPdf;
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
  
  // Get signatures for this result
  const signatures = {
    left: page.result?.leftSignature,
    center: page.result?.centerSignature,
    right: page.result?.rightSignature
  };

  // Generate patient header with correct data
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

  if (page.isRadiology) {
    // Handle radiology content
    content += RadiologyContent.generateContent(page.reportChunk);
  } else {
    // Handle pathology table
    const hasTrends = isFull && trendMap && 
      TrendService.hasAnyTrendsForTest(trendMap, page.testId, page.result.parameterResults);
    
    let tableHtml = PathologyTable.generate(page.chunk || []);

    if (hasTrends && page.chunkIndex === 0) {
      // Get trend dates from the first parameter
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
  
  return `
    <div class="page">
      <div class="page-content">${content}</div>
      ${signatureSection}
    </div>
  `;
}

function generateCompleteHtml(pageContents, options) {
  const { headerImg, footerImg, reserveHeaderFooterSpace } = options;
  
  // Get CSS with correct dimensions
  const css = Styles.generate({
    headerH: reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.headerHeight : headerImg ? CONFIG.DIMENSIONS.headerHeight : 0,
    footerH: reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.footerHeight : footerImg ? CONFIG.DIMENSIONS.footerHeight : 0,
    sigH: CONFIG.DIMENSIONS.signatureHeight,
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
      <body>
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