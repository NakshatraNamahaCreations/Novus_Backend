// main.js

import { PatientService } from "./services/patientService.js";
import { SignatureService } from "./services/signatureService.js";
import { ImageUtils } from "./utils/imageUtils.js";
import { generateSingleImagePagePdf, PdfProcessor } from "./processors/pdfProcessor.js";
import { PdfUtils } from "./utils/pdfUtils.js";
import { PageProcessor } from "./processors/pageProcessor.js";
import { TrendService } from "./services/trendService.js";

export async function generatePatient3PdfsNew({ orderId, patientId }) {
  try {
    console.log(`Starting PDF generation for Order: ${orderId}, Patient: ${patientId}`);

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

    const categoryIds = rawResults
      .map((r) => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);

    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const resultsWithSigs = await SignatureService.augmentResultsWithSignatures(rawResults, defaultSignatures);

    console.log("Building trend data...");
    const trendMap = await TrendService.buildTrendMap({
      results: resultsWithSigs,
      patientId,
    });

    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      console.log("Generating plain PDF...");
      const plainPdf = await generatePlainPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        trendMap,
      });

      console.log("Generating letterhead PDF...");
      const letterheadPdf = await generateLetterheadPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        headerImg: optimizedImages.header,
        footerImg: optimizedImages.footer,
        trendMap,
      });

      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        optimizedImages,
        trendMap,
      });

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
 * PLAIN PDF - NO IMAGES
 */
async function generatePlainPdf({ browser, order, patient, results, trendMap }) {
  try {
    const pages = PageProcessor.processResults(results, "standard");
    const html = generateCompleteHtml({
      order,
      patient,
      pages,
      headerImg: null,
      footerImg: null,
      trendMap,
      includeIndex: false,
    });
    return PdfProcessor.generatePdf(browser, html);
  } catch (err) {
    console.error("generatePlainPdf error:", err);
    throw err;
  }
}

/**
 * LETTERHEAD PDF - WITH HEADER/FOOTER IMAGES
 */
async function generateLetterheadPdf({ browser, order, patient, results, headerImg, footerImg, trendMap }) {
  try {
    const pages = PageProcessor.processResults(results, "standard");
    const html = generateCompleteHtml({
      order,
      patient,
      pages,
      headerImg,
      footerImg,
      trendMap,
      includeIndex: false,
    });
    return PdfProcessor.generatePdf(browser, html);
  } catch (err) {
    console.error("generateLetterheadPdf error:", err);
    throw err;
  }
}
/**
 * FULL PDF - cover + index + content + last page
 */
async function generateFullPdf({ browser, order, patient, results, optimizedImages, trendMap }) {
  try {
    const pdfBuffers = [];

    // 1. COVER PAGE (if exists)
    if (optimizedImages.cover) {
      const coverPdf = await generateSingleImagePagePdf(browser, optimizedImages.cover);
      pdfBuffers.push(coverPdf);
    }

    const pages = PageProcessor.processResults(results, "standard");
    
    // Calculate page offsets
    const coverOffset = optimizedImages.cover ? 1 : 0;
    const indexPageNumber = coverOffset + 1;
    const contentStartPage = indexPageNumber + 1;
    const totalPages = coverOffset + 2 + pages.length + 1; // cover + index + content pages + conditions

    // 2. INDEX PAGE (only index, no content)
    const indexHtml = generateIndexPageHtml({
      order,
      patient,
      pages,
      headerImg: optimizedImages.header,
      footerImg: optimizedImages.footer,
      currentPage: indexPageNumber,
      totalPages: totalPages,
      contentStartPage: contentStartPage
    });

    const indexPdf = await PdfProcessor.generatePdf(browser, indexHtml);
    pdfBuffers.push(indexPdf);

    // 3. CONTENT PAGES (only content, no index/conditions)
    const contentHtml = generateContentPagesHtml({
      order,
      patient,
      pages,
      headerImg: optimizedImages.header,
      footerImg: optimizedImages.footer,
      trendMap,
      startPage: contentStartPage,
      totalPages: totalPages
    });

    const contentPdf = await PdfProcessor.generatePdf(browser, contentHtml);
    pdfBuffers.push(contentPdf);

    // 4. CONDITIONS PAGE (only conditions)
    const conditionsHtml = generateConditionsPageHtml({
      patientDetails: getPatientDetails(order, patient),
      headerImg: optimizedImages.header,
      footerImg: optimizedImages.footer,
      pageNumber: totalPages // Conditions is the last page
    });

    const conditionsPdf = await PdfProcessor.generatePdf(browser, conditionsHtml);
    pdfBuffers.push(conditionsPdf);

    // 5. LAST PAGE (if exists)
    if (optimizedImages.last) {
      const lastPdf = await generateSingleImagePagePdf(browser, optimizedImages.last);
      pdfBuffers.push(lastPdf);
    }

    if (pdfBuffers.length > 1) return PdfUtils.mergePdfs(pdfBuffers);
    return contentPdf; // Fallback if only content exists
  } catch (err) {
    console.error("generateFullPdf error:", err);
    throw err;
  }
}

/**
 * Helper to get patient details
 */
function getPatientDetails(order, patient) {
  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);
  const reportRefId = PatientService.getReportRefId(order);
  const dates = PatientService.getOrderDates(order);

  const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
  const gender = patient.gender ? String(patient.gender).toUpperCase() : "N/A";

  return {
    name: patient.fullName || patient.name || "N/A",
    age: patientAge,
    gender,
    refBy: refDoctor || "N/A",
    reportRefId: reportRefId || "—",
    patientId: patient.id || "—",
    partner: partner || "—",
    collected: formatDateTime(dates.collectedAt) || "—",
    received: formatDateTime(dates.receivedAt) || "—",
    reported: formatDateTime(dates.reportedAt) || "—",
    reportedDate: dates.reportedAt ? formatDate(dates.reportedAt) : "—",
  };
}

/**
 * Generate ONLY index page HTML
 */
function generateIndexPageHtml({ order, patient, pages, headerImg, footerImg, currentPage, totalPages, contentStartPage }) {
  const patientDetails = getPatientDetails(order, patient);
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Medical Report - Index</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; background:#fff; }
          .pdf-link { text-decoration: none; color: inherit; }
        </style>
      </head>
      <body style="margin:0; padding:0;">
        ${generateIndexPage(pages, patientDetails, headerImg, footerImg, {
          currentPage,
          totalPages,
          contentStartPage
        })}
      </body>
    </html>
  `;
}

/**
 * Generate ONLY content pages HTML (no index, no conditions)
 */
function generateContentPagesHtml({ order, patient, pages, headerImg, footerImg, trendMap, startPage, totalPages }) {
  const patientDetails = getPatientDetails(order, patient);
  
  let allPagesHtml = "";

  if (pages && pages.length) {
    allPagesHtml += pages
      .map((page, idx) => {
        const currentPage = startPage + idx;
        
        return generatePageHtml(
          page, 
          patientDetails, 
          idx === pages.length - 1, 
          headerImg, 
          footerImg, 
          trendMap,
          currentPage,
          totalPages
        );
      })
      .join("");
  } else {
    allPagesHtml += generatePageHtml(
      null, 
      patientDetails, 
      true, 
      headerImg, 
      footerImg, 
      trendMap,
      startPage,
      totalPages
    );
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Medical Report - Content</title>
   <style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; background:#fff; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  /* Quill alignment */
  .ql-align-center { text-align: center; }
  .ql-align-right  { text-align: right; }
  .ql-align-justify{ text-align: justify; }
  .ql-editor p { margin: 0 0 8px 0; }
</style>

      </head>
      <body style="margin:0; padding:0;">
        ${allPagesHtml}
      </body>
    </html>
  `;
}

/**
 * Generate ONLY conditions page HTML
 */
function generateConditionsPageHtml({ patientDetails, headerImg, footerImg, pageNumber }) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Medical Report - Conditions</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; background:#fff; }
        </style>
      </head>
      <body style="margin:0; padding:0;">
        ${generateConditionsPage(patientDetails, headerImg, footerImg, pageNumber)}
      </body>
    </html>
  `;
}




/**
 * Generate complete HTML
 */
function generateCompleteHtml({ 
  order, 
  patient, 
  pages, 
  headerImg = null, 
  footerImg = null, 
  trendMap = null, 
  includeIndex = false,
  pageNumbers = null 
}) {
  try {
    const refDoctor = PatientService.getRefDoctorInfo(order);
    const partner = PatientService.getPartnerInfo(order);
    const reportRefId = PatientService.getReportRefId(order);
    const dates = PatientService.getOrderDates(order);

    const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
    const gender = patient.gender ? String(patient.gender).toUpperCase() : "N/A";

    const patientDetails = {
      name: patient.fullName || patient.name || "N/A",
      age: patientAge,
      gender,
      refBy: refDoctor || "N/A",
      reportRefId: reportRefId || "—",
      patientId: patient.id || "—",
      partner: partner || "—",
      collected: formatDateTime(dates.collectedAt) || "—",
      received: formatDateTime(dates.receivedAt) || "—",
      reported: formatDateTime(dates.reportedAt) || "—",
      reportedDate: dates.reportedAt ? formatDate(dates.reportedAt) : "—",
    };

    let allPagesHtml = "";

    if (includeIndex && pages && pages.length) {
      const pageOffset = pageNumbers?.startPage || 2;
      allPagesHtml += generateIndexPage(pages, patientDetails, headerImg, footerImg, pageNumbers);
    }

    if (pages && pages.length) {
      allPagesHtml += pages
        .map((page, idx) => {
          const currentPage = pageNumbers?.startPage ? pageNumbers.startPage + idx : null;
          const totalPages = pageNumbers?.totalPages || null;
          
          return generatePageHtml(
            page, 
            patientDetails, 
            idx === pages.length - 1, 
            headerImg, 
            footerImg, 
            trendMap,
            currentPage,
            totalPages
          );
        })
        .join("");

      const conditionsPageNumber = pageNumbers?.totalPages || null;
      allPagesHtml += generateConditionsPage(patientDetails, headerImg, footerImg, conditionsPageNumber);
    } else {
      allPagesHtml += generatePageHtml(null, patientDetails, true, headerImg, footerImg, trendMap);
      allPagesHtml += generateConditionsPage(patientDetails, headerImg, footerImg);
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Medical Report</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4; margin: 0; }
            body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; background:#fff; }

            /* better page-break behavior for tables */
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }

            /* PDF link styling */
            .pdf-link { text-decoration: none; color: inherit; }
            .pdf-link:hover { opacity: 0.8; }
          </style>
        </head>
        <body style="margin:0; padding:0;">
          ${allPagesHtml}
        </body>
      </html>
    `;
  } catch (err) {
    console.error("generateCompleteHtml error:", err);
    throw err;
  }
}

/**
 * Enhanced INDEX PAGE with clickable links
 */
function generateIndexPage(pages, patientDetails, headerImg = null, footerImg = null, pageNumbers = null) {
  try {
    const headerHeight = headerImg ? "110px" : "70px";
    const footerHeight = footerImg ? "120px" : "80px";
    const pageHeight = "297mm";
    
    const currentPage = pageNumbers?.currentPage || 1;
    const totalPages = pageNumbers?.totalPages || pages.length + 2;

    // Group tests by category/section
    const testGroups = new Map();
    pages.forEach((page, index) => {
      const testName = page.testName || "Test";
      const sectionName = page.chunk?.[0]?.sectionName || 
                         page.chunk?.[0]?.profileName || 
                         page.chunk?.[0]?.groupName || 
                         "General Tests";
      
      if (!testGroups.has(sectionName)) {
        testGroups.set(sectionName, []);
      }
      
      testGroups.get(sectionName).push({
        name: testName,
        pageNumber: (pageNumbers?.startPage || 2) + index,
        part: page.chunkCount > 1 ? ` (Part ${page.chunkIndex + 1}/${page.chunkCount})` : ""
      });
    });

    return `
      <div style="width:210mm; height:${pageHeight}; margin:0 auto; page-break-after:always; background:#fff; position:relative; overflow:hidden;">

        <!-- HEADER -->
        <div style="position:absolute; top:0; left:0; width:100%; height:${headerHeight}; z-index:10;">
          ${
            headerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                  <img src="${headerImg}" alt="Header" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:70px; width:100%;"></div>`
          }
        </div>

        <div style="position:absolute; top:${headerHeight}; bottom:${footerHeight}; width:100%; padding:40px 0;">
          <div style="width:180mm; margin:0 auto;">
            <!-- Patient Summary -->
            <div style="margin-bottom:30px;">
              <div style="font-size:28px; font-weight:700; color:#111827; margin-bottom:8px;">
                ${escapeHtml(patientDetails.name)}
              </div>
              <div style="font-size:16px; color:#6b7280; font-weight:500; margin-bottom:4px;">
                ${escapeHtml(patientDetails.age)} Year(s) · ${escapeHtml(patientDetails.gender)}
              </div>
              <div style="font-size:14px; color:#6b7280;">
                Report ID: ${escapeHtml(patientDetails.reportRefId)} · ${escapeHtml(patientDetails.reportedDate)}
              </div>
            </div>

            <!-- Test Count Summary -->
            <div style="background:#f8f9fa; border-radius:8px; padding:15px; margin-bottom:30px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-size:14px; color:#6b7280; margin-bottom:4px;">Total Tests</div>
                  <div style="font-size:24px; font-weight:700; color:#111827;">${pages.length}</div>
                </div>
                <div>
                  <div style="font-size:14px; color:#6b7280; margin-bottom:4px;">Total Pages</div>
                  <div style="font-size:24px; font-weight:700; color:#111827;">${totalPages}</div>
                </div>
                <div>
                  <div style="font-size:14px; color:#6b7280; margin-bottom:4px;">Report Status</div>
                  <div style="font-size:14px; font-weight:600; color:#065f46; padding:4px 12px; background:#d1fae5; border-radius:20px;">
                    COMPLETED
                  </div>
                </div>
              </div>
            </div>

            <!-- Index Title -->
            <div style="margin-bottom:20px;">
              <div style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
                Report Index
              </div>
              <div style="font-size:14px; color:#6b7280;">
                Click on any test name to navigate directly to that section
              </div>
            </div>

            <!-- Test Index with Links -->
            ${Array.from(testGroups.entries()).map(([sectionName, tests]) => `
              <div style="margin-bottom:30px;">
                <div style="font-size:18px; font-weight:600; color:#111827; margin-bottom:12px; padding-bottom:6px; border-bottom:2px solid #f3f4f6;">
                  ${escapeHtml(sectionName)}
                </div>
                <ul style="list-style:none; padding:0; margin:0;">
                  ${tests.map(test => `
                    <li style="margin-bottom:12px;">
                      <a href="#page-${test.pageNumber}" 
                         class="pdf-link"
                         style="
                           display:flex;
                           align-items:center;
                           justify-content:space-between;
                           padding:12px 16px;
                           background:#ffffff;
                           border:1px solid #e5e7eb;
                           border-radius:8px;
                           text-decoration:none;
                           color:#111827;
                           transition:all 0.2s ease;
                         "
                         onclick="return false;">
                        <div style="display:flex; align-items:center; gap:12px;">
                          <div style="width:32px; height:32px; background:#f3f4f6; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                          </div>
                          <div>
                            <div style="font-size:15px; font-weight:600; color:#111827;">
                              ${escapeHtml(test.name)}${escapeHtml(test.part)}
                            </div>
                            <div style="font-size:12px; color:#6b7280; margin-top:2px;">
                              ${test.pageNumber} parameter${test.pageNumber > 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                          <div style="font-size:13px; color:#6b7280; font-weight:500;">
                            Page ${test.pageNumber}
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14"></path>
                            <path d="m12 5 7 7-7 7"></path>
                          </svg>
                        </div>
                      </a>
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}

            <!-- Important Notes -->
            <div style="background:#fff3cd; border:1px solid #ffecb5; border-radius:8px; padding:16px; margin-top:30px;">
              <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#856404" stroke="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path>
                </svg>
                <div style="font-size:14px; font-weight:600; color:#856404;">
                  Important Notes
                </div>
              </div>
              <div style="font-size:12px; color:#856404; line-height:1.5;">
                • This report contains ${pages.length} test${pages.length > 1 ? 's' : ''} across ${totalPages} pages<br>
                • Results should be interpreted by a qualified healthcare professional<br>
                • For any queries, contact your healthcare provider or lab directly
              </div>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="position:absolute; bottom:0; left:0; width:100%; height:${footerHeight}; z-index:10;">
          ${
            footerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#fff;">
                  <img src="${footerImg}" alt="Footer" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:80px; width:100%;"></div>`
          }
        </div>

        <!-- PAGE NUMBER -->
        <div style="
          position: fixed;
          bottom: 15px;
          right: 25mm;
          font-size: 10px;
          color: #666;
          font-family: Arial, sans-serif;
          z-index: 100;
        ">
          Page ${currentPage} of ${totalPages}
        </div>
      </div>
    `;
  } catch (err) {
    console.error("generateIndexPage error:", err);
    return "";
  }
}

/**
 * Patient details card
 */
function generatePatientDetailsCardHtml(patientDetails) {
  return `
    <div style="width:190mm; margin:0 auto; padding-bottom:5px">
      <div style="border: 1px solid #E5E7EB; border-radius: 12px; background: #FFFFFF; overflow: hidden; ">
        

        <div style="display: flex;">
          <div style="flex: 1; padding: 14px 16px;">
            <div style="font-size: 20px; font-weight: 800; color: #111827; line-height: 1.1; margin-bottom: 6px;">
              ${escapeHtml(patientDetails.name)}
            </div>

            <div style="font-size: 12px;">
              <div style="font-size: 13px; color:#000000; margin-bottom: 6px;">
                ${escapeHtml(patientDetails.age)}/${escapeHtml(patientDetails.gender)}
              </div>
              <div style="font-size: 13px; color:#000000;">
                ${escapeHtml(patientDetails.partner || "N/A")}
              </div>
            </div>
          </div>

          <div style="width: 1px; background: #E5E7EB;"></div>

          <div style="flex: 1; padding: 14px 16px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px;">
              <div style="font-size: 12px; color: #000000; min-width: 72px;">Report ID :</div>
              <div style="font-size: 13px; font-weight: 700; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; text-align:right;">
                ${escapeHtml(patientDetails.reportRefId)}
              </div>
            </div>

            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px;">
              <div style="font-size: 12px; color: #000000; min-width: 72px;">Patient ID :</div>
              <div style="font-size: 13px; font-weight: 700; color: #111827; text-align:right;">
                ${escapeHtml(patientDetails.patientId)}
              </div>
            </div>

            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px;">
              <div style="font-size: 12px; color: #000000; min-width: 72px;">Ref. by :</div>
              <div style="font-size: 13px; color: #374151; font-weight: 600; text-align:right;">
                ${escapeHtml(patientDetails.refBy || "N/A")}
              </div>
            </div>
          </div>

          <div style="width: 1px; background: #E5E7EB;"></div>

          <div style="flex: 1; padding: 14px 16px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 10px;">
              <div style="font-size: 11px; color: #000000; min-width: 72px;">Collected :</div>
              <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                ${escapeHtml(patientDetails.collected)}
              </div>
            </div>

            <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 10px;">
              <div style="font-size: 11px; color: #000000; min-width: 72px;">Received :</div>
              <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                ${escapeHtml(patientDetails.received)}
              </div>
            </div>

            <div style="display:flex; align-items:flex-start; justify-content:space-between;">
              <div style="font-size: 11px; color: #000000; min-width: 72px;">Reported :</div>
              <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                ${escapeHtml(patientDetails.reported)}
              </div>
            </div>
          </div>
        </div>

        <div style="height: 1px; background: #F3F4F6;"></div>
      </div>
    </div>
  `;
}

function normalizeQuillHtml(html) {
  if (!html) return "";
  let s = String(html);

  // handle \" and \\"
  s = s.replace(/\\+"/g, '"');   // <-- converts \" and \\" and even \\\" to "
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/\\t/g, "\t");
  s = s.replace(/\\r/g, "\r");

  // if fully JSON-stringified like "\"<p class=\\\"ql-align-center\\\">...\""
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try { s = JSON.parse(t); } catch {}
  }

  return s;
}


/**
 * ✅ PAGE HTML (with new pathology layout + trends panel)
 */
function generatePageHtml(page, patientDetails, isLastPage, headerImg = null, footerImg = null, trendMap = null, pageNumber = null, totalPages = null) {
  try {
    let testTitle = "Medical Report";
    if (page) {
      const partSuffix = page.chunkCount > 1 ? ` (Part ${page.chunkIndex + 1}/${page.chunkCount})` : "";
      testTitle = `${page.testName || "Test"}${partSuffix}`;
    }

    const isRadiology = Boolean(page?.isRadiology);

    let contentHtml = "";
   if (page && isRadiology && page.reportChunk) {
  const clean = normalizeQuillHtml(page.reportChunk);
  contentHtml = `<div class="ql-editor" style="font-size: 13px; line-height: 1.6;">${clean}</div>`;
}

     else if (page && page.chunk && page.chunk.length > 0) {
      const testId = page?.result?.testId || page?.result?.test?.id || page?.testId || null;

      // LEFT sections: if no sectionName/profileName in items => fallback to page.testName (CBC..)
      const leftHtml = generatePathologyStackedSections(page.chunk, {
        defaultSection: page?.testName || "Test",
      });

      // RIGHT trends: last 3 values
      const trendCtx = buildTrendContext({
        chunk: page.chunk,
        testId,
        trendMap,
        columnsCount: 3,
      });

      const rightHtml = renderTrendsPanelData({
        title: "Trends (For last three tests)",
        trendCtx,
      });

      contentHtml = `
        <div style="display:flex; gap:14px; align-items:stretch;">
          <div style="flex:1; min-width:0;">
            ${leftHtml}
          </div>
          <div style="width:72mm; flex-shrink:0;">
            ${rightHtml}
          </div>
        </div>
      `;
    } else {
      contentHtml = "<p>No test content available.</p>";
    }

    let signatureHtml = "";
    if (page && page.result && page.chunkIndex === page.chunkCount - 1) {
      signatureHtml = generateSignatures(page.result);
    }

    const headerHeight = headerImg ? "110px" : "70px";
    const footerHeight = footerImg ? "120px" : "80px";
    const pageHeight = "297mm";

    const footerHeightPx = footerImg ? 120 : 80;
    const safeBottomMargin = footerHeightPx + 10;

    return `
      <div style="width:210mm; height:${pageHeight}; margin:0 auto; page-break-after:always; background:#fff; position:relative; overflow:hidden;">

        <!-- HEADER -->
        <div style="position:absolute; top:0; left:0; width:100%; height:${headerHeight}; z-index:10;">
          ${
            headerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                  <img src="${headerImg}" alt="Header" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:70px; width:100%;"></div>`
          }
        </div>

        <!-- FOOTER -->
        <div style="position:absolute; bottom:0; left:0; width:100%; height:${footerHeight}; z-index:10;">
          ${
            footerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#fff;">
                  <img src="${footerImg}" alt="Footer" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:80px; width:100%;"></div>`
          }
        </div>

        <!-- PAGE NUMBER -->
        ${pageNumber && totalPages ? `
          <div style="
  position: absolute;
  bottom: ${footerImg ? "135px" : "95px"};  /* put it ABOVE footer */
  right: 25mm;
  font-size: 10px;
  color: #666;
  font-family: Arial, sans-serif;
  z-index: 9999;
">
  Page ${pageNumber} of ${totalPages}
</div>
        ` : ''}

        <!-- BODY -->
        <div style="
          position:absolute;
          top:${headerHeight};
          left:0;
          right:0;
          bottom:${safeBottomMargin}px;
          overflow: visible;
        ">
          <div style="width:190mm; margin:0 auto; padding:8px 0 5px 0;">

            ${generatePatientDetailsCardHtml(patientDetails)}

           

            <div style="padding-bottom: 5px;">
              ${contentHtml}
              ${signatureHtml}
            </div>

          </div>
        </div>

      </div>
    `;
  } catch (err) {
    console.error("generatePageHtml error:", err);
    return `<div style="padding:20px;">Error rendering page</div>`;
  }
}

/**
 * ✅ Pathology stacked sections like screenshot
 */
function generatePathologyStackedSections(items, opts = {}) {
  if (!items?.length) return "<p>No parameters to display</p>";

  const defaultSection = opts.defaultSection || "Test";

  const groups = new Map();
  for (const it of items) {
    const section =
      it.sectionName ||
      it.profileName ||
      it.groupName ||
      it.panelName ||
      it.categoryName ||
      it.testName ||
      it?.test?.name ||
      it?.result?.test?.name ||
      defaultSection;

    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(it);
  }

  let html = "";
  for (const [sectionName, rows] of groups.entries()) {
    html += `
      <div style="margin: 10px 0;">
        ${sectionHeaderBar(sectionName)}
        ${sectionTable(rows)}
      </div>
    `;
  }
  return html;
}

function sectionHeaderBar(title) {
  return `
    <div style="
      background:#F6EBDD;
      border-radius:6px;
      padding:8px 10px;
      font-weight:800;
      font-size:12px;
      color:#111827;
      margin-bottom:6px;
    ">
      ${escapeHtml(title)}
    </div>
  `;
}

function sectionTable(rows) {
  const border = "#e5e7eb";
  return `
    <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
      <colgroup>
        <col style="width:52%;">
        <col style="width:22%;">
        <col style="width:26%;">
      </colgroup>

      <thead>
        <tr>
          <th style="text-align:left; font-size:11px; color:#6b7280; font-weight:800; padding:4px 6px;">Test Name</th>
          <th style="text-align:left; font-size:11px; color:#6b7280; font-weight:800; padding:4px 6px;">Result</th>
          <th style="text-align:left; font-size:11px; color:#6b7280; font-weight:800; padding:4px 6px;">Bio. Ref. Interval</th>
        </tr>
      </thead>

      <tbody>
        ${rows.map(renderParamRow).join("")}
      </tbody>
    </table>
  `;
}

function renderParamRow(item) {
  const border = "#e5e7eb";
  const name = escapeHtml(item.parameter?.name || item.parameterName || "—");
  const method = escapeHtml(item.parameter?.method || item.method || "");

  const rawVal = (item.valueNumber ?? item.valueText ?? "").toString().trim();
  const unit = (item.unit || item.parameter?.unit || "").toString().trim();
  const rangeText = buildRangeText(item);

  const { indicatorHtml, valueHtml } = buildValueHtml(item, rawVal, unit);

  return `
    <tr style="height:44px;">
      <td style="padding:8px 6px; vertical-align:middle; border-top:1px solid ${border};">
        <div style=" font-size:13px; color:#111827; line-height:1.1;">
          ${name}
        </div>
        <div style="
          font-size:10px;
          color:gray;
          line-height:1.1;
          margin-top:2px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          max-width:100%;
        ">
          ${method}
        </div>
      </td>

      <td style="padding:8px 6px; vertical-align:middle; border-top:1px solid ${border};">
        <div style="display:flex; align-items:center; gap:6px;">
          ${indicatorHtml}
          <div style="font-weight:900; font-size:12px; color:#111827;">
            ${valueHtml}
          </div>
        </div>
      </td>

      <td style="padding:8px 6px; vertical-align:middle; border-top:1px solid ${border}; color:#374151; font-size:12px;">
        ${escapeHtml(rangeText || "—")}
      </td>
    </tr>
  `;
}


function buildRangeText(item) {
  const note = item.normalRangeText || item.parameter?.ranges?.[0]?.referenceRange;
  if (note) return note;

  let lower = item.parameter?.lowerLimit ?? item.parameter?.ranges?.[0]?.lowerLimit;
  let upper = item.parameter?.upperLimit ?? item.parameter?.ranges?.[0]?.upperLimit;

  if (lower == null && upper == null) return "";

  lower = lower != null ? String(lower) : "";
  upper = upper != null ? String(upper) : "";

  const unit = (item.unit || item.parameter?.unit || "").toString().trim();
  const core = `${lower}${lower && upper ? " - " : ""}${upper}`.trim();

  return unit ? `${core} ${unit}`.trim() : core;
}

function buildValueHtml(item, rawVal, unit) {
  const vLower = String(rawVal ?? "").trim().toLowerCase();

  const isPositive = ["positive", "pos", "+", "reactive", "detected"].includes(vLower);
  const isNegative = ["negative", "neg", "-", "non reactive", "non-reactive", "not detected"].includes(vLower);

  if (isPositive || isNegative) {
    const pillBg = isPositive ? "#FEE2E2" : "#ECFDF5";
    const pillText = isPositive ? "#991B1B" : "#065F46";
    const label = isPositive ? "Positive" : "Negative";

    return {
      indicatorHtml: "",
      valueHtml: `
        <span style="
          display:inline-block;
          padding:2px 8px;
          border-radius:999px;
          background:${pillBg};
          color:${pillText};
          font-weight:900;
          font-size:11px;
        ">${label}</span>
      `,
    };
  }

  const n = parseFloat(String(rawVal ?? "").trim());

  // 1) Try numeric limits from structured fields
  let lower =
    item?.parameter?.lowerLimit ??
    item?.parameter?.ranges?.[0]?.lowerLimit ??
    item?.lowerLimit ??
    item?.ranges?.[0]?.lowerLimit ??
    null;

  let upper =
    item?.parameter?.upperLimit ??
    item?.parameter?.ranges?.[0]?.upperLimit ??
    item?.upperLimit ??
    item?.ranges?.[0]?.upperLimit ??
    null;

  lower = lower != null ? parseFloat(lower) : null;
  upper = upper != null ? parseFloat(upper) : null;

  // 2) If still missing, parse from text like "1.5 - 4.5"
  if ((lower == null && upper == null)) {
    const rangeText =
      item?.normalRangeText ||
      item?.parameter?.ranges?.[0]?.referenceRange ||
      item?.parameter?.referenceRange ||
      "";

    const parsed = parseRangeFromText(rangeText);
    if (parsed) {
      lower = parsed.lower;
      upper = parsed.upper;
    }
  }

  let arrow = "";
  if (!Number.isNaN(n) && (lower != null || upper != null)) {
    if (lower != null && n < lower) arrow = "↓";
    else if (upper != null && n > upper) arrow = "↑";
  }

  const indicatorHtml = arrow
    ? `<span style="font-weight:900; color:#e11d48; font-size:14px; line-height:1;">${arrow}</span>`
    : "";

  const finalVal = rawVal != null && String(rawVal).trim() !== "" ? escapeHtml(String(rawVal)) : "—";

  const cleanUnit = (unit || "").toString().trim();
  const alreadyHasUnit = cleanUnit && String(rawVal || "").toLowerCase().includes(cleanUnit.toLowerCase());

  const valueHtml =
    cleanUnit && !alreadyHasUnit
      ? `${finalVal} <span style="font-weight:600; color:#6b7280; font-size:11px;">${escapeHtml(cleanUnit)}</span>`
      : `${finalVal}`;

  return { indicatorHtml, valueHtml };
}

/**
 * Parses ranges from strings like:
 * "1.5 - 4.5"
 * "12 - 15 g/dL"
 * "0.02 to 0.1"
 * Returns {lower:number|null, upper:number|null} or null
 */
function parseRangeFromText(text) {
  try {
    const s = String(text || "").replace(/,/g, "").trim();
    if (!s) return null;

    // capture two numbers separated by -, – , to
    const m = s.match(
      /(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i
    );
    if (!m) return null;

    const lower = parseFloat(m[1]);
    const upper = parseFloat(m[2]);

    return {
      lower: Number.isNaN(lower) ? null : lower,
      upper: Number.isNaN(upper) ? null : upper,
    };
  } catch {
    return null;
  }
}

/**
 * ✅ Build real trend context from trendMap
 */
function buildTrendContext({ chunk, testId, trendMap, columnsCount = 3 }) {
  try {
    if (!trendMap || !trendMap.size || !testId || !chunk?.length) {
      return { hasTrends: false, dates: [], dateLabels: [], rows: [] };
    }

    const allDates = [];
    for (const item of chunk) {
      const pid = item?.parameterId || item?.parameter?.id || null;
      if (!pid) continue;

      const arr = trendMap.get(`${testId}:${pid}`) || [];
      for (const t of arr) if (t?.date) allDates.push(String(t.date));
    }

    const dates = pickLastNUniqueDates(allDates, columnsCount);
    if (!dates.length) return { hasTrends: false, dates: [], dateLabels: [], rows: [] };

    const rows = (chunk || []).map((item) => {
      const pid = item?.parameterId || item?.parameter?.id || null;
      const name = item?.parameter?.name || item?.parameterName || "—";
      const unit = (item.unit || item.parameter?.unit || "").toString().trim();

      const trends = pid ? trendMap.get(`${testId}:${pid}`) || [] : [];

      const values = dates.map((d) => {
        const match = trends.find((t) => String(t?.date) === String(d));
        let v = match?.value ?? "—";
        v = v == null || v === "" ? "—" : String(v);

        const alreadyHasUnit = unit && v.toLowerCase().includes(unit.toLowerCase());
        return v === "—" ? "—" : unit && !alreadyHasUnit ? `${v} ${unit}` : v;
      });

      return { name, values };
    });

    const filtered = rows.filter((r) => (r.values || []).some((x) => x !== "—"));

    return {
      hasTrends: filtered.length > 0,
      dates,
      dateLabels: dates.map(safeDateLabel),
      rows: filtered,
    };
  } catch {
    return { hasTrends: false, dates: [], dateLabels: [], rows: [] };
  }
}

/**
 * ✅ Trends panel UI like screenshot
 */
function renderTrendsPanelData({ title, trendCtx }) {
  const border = "#e5e7eb";

  if (!trendCtx?.hasTrends) {
    return `
      <div style=" border-radius:10px; height:100%; padding:14px; display:flex; flex-direction:column; background:#fff;">
        <div style="font-weight:900; font-size:12px; margin-bottom:10px; color:#111827; text-align:center;">
          ${escapeHtml(title)}
        </div>

        <div style="display:flex; gap:6px; margin-bottom:12px;">
          ${["Date 1", "Date 2", "Date 3"]
            .map(
              (d) => `
            <div style="flex:1; background:#F6EBDD; border-radius:6px; padding:6px 0; text-align:center; font-weight:800; font-size:11px;">
              ${d}
            </div>
          `,
            )
            .join("")}
        </div>

        <div style="flex:1;  border-radius:8px; display:flex; align-items:center; justify-content:center; padding:18px; text-align:center; color:#9ca3af; font-weight:700; font-size:12px;">
          We don't have any of your previous lab results for these tests in our records
        </div>
      </div>
    `;
  }

  const labels = trendCtx.dateLabels?.length ? trendCtx.dateLabels : ["—", "—", "—"];

  return `
    <div style="border:1px solid ${border}; border-radius:10px; height:100%; padding:14px; display:flex; flex-direction:column; background:#fff; margin-top:10px">
      <div style="font-weight:900; font-size:12px; margin-bottom:10px; color:#111827; text-align:center;">
        ${escapeHtml(title)} 
      </div>

      <div style="display:flex; gap:6px; margin-bottom:10px;">
        ${labels
          .map(
            (d) => `
          <div style="flex:1; background:#F6EBDD; border-radius:6px; padding:6px 0; text-align:center; font-weight:800; font-size:11px;">
            ${escapeHtml(d)}
          </div>
        `,
          )
          .join("")}
      </div>

      <div style="flex:1; border:1px solid ${border}; border-radius:8px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
          <colgroup>
           
            <col style="width:33%;">
            <col style="width:33%;">
            <col style="width:33%;">
          </colgroup>
         <tbody>
  ${(trendCtx.rows || [])
    .slice(0, 14)
    .map(
      (r) => `
        <tr style="height:44px;">
          ${(r.values || [])
            .slice(0, 3)
            .map(
              (v) => `
                <td style="
                  padding:8px;
                  border-top:1px solid ${border};
                  font-size:11px;
                  color:#374151;
                  text-align:left;
                  vertical-align:middle;
                  white-space:nowrap;
                  overflow:hidden;
                  text-overflow:ellipsis;
                ">
                  ${escapeHtml(v)}
                </td>
              `,
            )
            .join("")}
        </tr>
      `,
    )
    .join("")}
</tbody>

        </table>
      </div>
    </div>
  `;
}

/**
 * SIGNATURES
 */
function generateSignatures(result) {
  try {
    const sigLeft = result?.sigLeft;
    const sigCenter = result?.sigCenter;
    const sigRight = result?.sigRight;

    if (!sigLeft && !sigCenter && !sigRight) return "";

    return `
      <div style="margin: 20px 0 5px 0; padding-top: 12px; border-top: 2px solid #dee2e6;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          ${generateSignatureColumn(sigLeft)}
          ${generateSignatureColumn(sigCenter)}
          ${generateSignatureColumn(sigRight)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error("generateSignatures error:", err);
    return "";
  }
}

function generateSignatureColumn(sig) {
  try {
    if (!sig) return `<div style="flex:1; text-align:center; min-height:70px; padding:0 10px;"></div>`;

    const name = escapeHtml(sig.name || "");
    const title = escapeHtml(sig.designation || sig.qualification || "");
    const imageUrl = sig.signatureImg || sig.imageUrl || "";

    return `
      <div style="flex:1; text-align:center; min-height:70px; padding:0 10px;">
        ${imageUrl ? `<img src="${imageUrl}" alt="Signature" style="max-height:50px; max-width:160px; margin-bottom:6px; display:inline-block;">` : ""}
        <div style="font-weight:700; font-size:12px; margin-bottom:3px; color:#212529;">${name}</div>
        <div style="font-size:10px; color:#6c757d; font-style:italic;">${title}</div>
      </div>
    `;
  } catch (err) {
    console.error("generateSignatureColumn error:", err);
    return `<div style="flex:1; text-align:center; min-height:70px; padding:0 10px;"></div>`;
  }
}

/**
 * CONDITIONS PAGE with page number
 */
function generateConditionsPage(patientDetails, headerImg = null, footerImg = null, pageNumber = null) {
  try {
    const headerHeight = headerImg ? "110px" : "70px";
    const footerHeight = footerImg ? "120px" : "80px";
    const pageHeight = "297mm";

    return `
      <div style="width:210mm; height:${pageHeight}; margin:0 auto; page-break-before:always; background:#fff; position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; width:100%; height:${headerHeight}; z-index:10;">
          ${
            headerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                  <img src="${headerImg}" alt="Header" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:70px; width:100%;"></div>`
          }
        </div>

        <div style="position:absolute; top:${headerHeight}; bottom:${footerHeight}; width:100%; padding:40px 0;">
          <div style="width:180mm; margin:0 auto; padding:20px;">
            ${generateConditionsHtml()}
          </div>
        </div>

        <div style="position:absolute; bottom:0; left:0; width:100%; height:${footerHeight}; z-index:10;">
          ${
            footerImg
              ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#fff;">
                  <img src="${footerImg}" alt="Footer" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`
              : `<div style="height:80px; width:100%;"></div>`
          }
        </div>

        <!-- PAGE NUMBER -->
        ${pageNumber ? `
          <div style="
            position: fixed;
            bottom: 15px;
            right: 25mm;
            font-size: 10px;
            color: #666;
            font-family: Arial, sans-serif;
            z-index: 100;
          ">
            Page ${pageNumber} of ${pageNumber}
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    console.error("generateConditionsPage error:", err);
    return "";
  }
}

function generateConditionsHtml() {
  return `
    <div style="margin-top: 20px; padding: 20px; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="font-weight: 800; font-size: 14px; text-transform: uppercase; margin-bottom: 15px; color: #212529; text-align: center; letter-spacing: 0.5px;">
        CONDITIONS OF LABORATORY TESTING & REPORTING
      </div>
      <ul style="font-size: 13px; line-height: 1.6; color: #495057; padding-left: 20px; margin-bottom: 25px;">
        <li style="margin-bottom: 10px;">The test results reported herein pertain only to the specimen received and tested by Novus Health Labs.</li>
        <li style="margin-bottom: 10px;">It is presumed that the specimen submitted belongs to the patient whose name and details appear on the test requisition form.</li>
        <li style="margin-bottom: 10px;">Laboratory investigations are performed to assist the referring physician in clinical diagnosis and should be interpreted in correlation with the patient's clinical condition.</li>
        <li style="margin-bottom: 10px;">All tests are performed using validated laboratory methods and internal quality control procedures.</li>
        <li style="margin-bottom: 10px;">Test results are dependent on the quality, quantity, and integrity of the specimen received, as well as the analytical methodology used.</li>
        <li style="margin-bottom: 10px;">Report delivery timelines are indicative and may be affected due to unforeseen technical or operational circumstances. Any inconvenience caused is regretted.</li>
      </ul>
      <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; font-size: 11px; color: #6c757d; text-align: center; border: 1px solid #e9ecef;">
        <div style="font-weight: 700; margin-bottom: 6px; font-size: 12px; color: #495057;">Unnathi TeleMed Pvt. Ltd.</div>
        <div style="margin-bottom: 4px;">Door No, 1028/3A, Jayalakshmi Vilas Road,</div>
        <div style="margin-bottom: 8px;">Chamaraja Mohalla, Mysuru, Karnataka 570005</div>
        <div style="border-top: 1px solid #dee2e6; padding-top: 8px; margin-top: 8px;">
          <a href="http://www.novushealth.in" style="color: #007bff; text-decoration: none; margin: 0 8px;">www.novushealth.in</a> |
          <a href="mailto:info@novushealth.in" style="color: #007bff; text-decoration: none; margin: 0 8px;">info@novushealth.in</a> |
          <span style="margin: 0 8px;">📞 +91 74119 99911</span>
        </div>
      </div>
    </div>
  `;
}

// ------------------------------
// Trend helpers
// ------------------------------
function pickLastNUniqueDates(dates, n) {
  try {
    const clean = (dates || []).filter(Boolean).map(String);
    const uniq = [];
    for (let i = clean.length - 1; i >= 0; i--) {
      const d = clean[i];
      if (!uniq.includes(d)) uniq.push(d);
      if (uniq.length === n) break;
    }
    return uniq.reverse();
  } catch {
    return [];
  }
}

function safeDateLabel(d) {
  try {
    if (!d || d === "—") return "—";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return String(d || "—");
  }
}

// ------------------------------
// Utilities
// ------------------------------
function calculateAge(dob) {
  try {
    if (!dob) return "N/A";
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return "N/A";
  }
}

function formatDateTime(date) {
  try {
    if (!date) return "—";
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function formatDate(date) {
  try {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function escapeHtml(str) {
  try {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  } catch {
    return "";
  }
}