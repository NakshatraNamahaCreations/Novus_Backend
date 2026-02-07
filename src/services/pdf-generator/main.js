// main.js - WITH HEADER/FOOTER IMAGES FOR LETTERHEAD & FULL PDF
import { PatientService } from "./services/patientService.js";
import { SignatureService } from "./services/signatureService.js";
import { ImageUtils } from "./utils/imageUtils.js";
import { generateSingleImagePagePdf, PdfProcessor } from "./processors/pdfProcessor.js";
import { PdfUtils } from "./utils/pdfUtils.js";
import { PageProcessor } from "./processors/pageProcessor.js";

export async function generatePatient3PdfsNew({ orderId, patientId }) {
  try {
    console.log(`Starting PDF generation for Order: ${orderId}, Patient: ${patientId}`);

    // Fetch Data
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

    // Get signatures
    const categoryIds = rawResults
      .map((r) => r.test?.categoryId)
      .filter(Boolean)
      .map(Number);

    const defaultSignatures = await SignatureService.getDefaultSignaturesByCategory(categoryIds);
    const resultsWithSigs = await SignatureService.augmentResultsWithSignatures(
      rawResults,
      defaultSignatures
    );

    // Optimize images
    const optimizedImages = await ImageUtils.optimizeLayoutImages(layout);

    // Create browser
    const browser = await PdfProcessor.createBrowser();
    console.log("Browser instance created");

    try {
      // 1. Plain PDF (NO images, just blank spaces)
      console.log("Generating plain PDF...");
      const plainPdf = await generatePlainPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
      });

      // 2. Letterhead PDF (WITH header/footer images)
      console.log("Generating letterhead PDF...");
      const letterheadPdf = await generateLetterheadPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        headerImg: optimizedImages.header,
        footerImg: optimizedImages.footer,
      });

      // 3. Full PDF with cover pages and header/footer
      console.log("Generating full PDF...");
      const fullPdf = await generateFullPdf({
        browser,
        order,
        patient,
        results: resultsWithSigs,
        layout,
        optimizedImages,
      });

      // Compress
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
 * PLAIN PDF - NO IMAGES, JUST BLANK SPACES
 */
async function generatePlainPdf(options) {
  const { browser, order, patient, results } = options;

  // Process results into pages
  const pages = PageProcessor.processResults(results, "standard");
  console.log(`Processed ${pages.length} pages`);

  // Generate complete HTML WITHOUT images
  const html = generateCompleteHtml({ 
    order, 
    patient, 
    pages,
    headerImg: null,
    footerImg: null
  });

  // Generate PDF
  return PdfProcessor.generatePdf(browser, html);
}

/**
 * LETTERHEAD PDF - WITH HEADER/FOOTER IMAGES
 */
async function generateLetterheadPdf(options) {
  const { browser, order, patient, results, headerImg, footerImg } = options;

  // Process results into pages
  const pages = PageProcessor.processResults(results, "standard");
  console.log(`Processed ${pages.length} pages for letterhead`);

  // Generate complete HTML WITH images
  const html = generateCompleteHtml({ 
    order, 
    patient, 
    pages,
    headerImg: headerImg,
    footerImg: footerImg
  });

  // Generate PDF
  return PdfProcessor.generatePdf(browser, html);
}

/**
 * Generate complete HTML with optional header/footer images
 */
function generateCompleteHtml(options) {
  const { order, patient, pages, headerImg = null, footerImg = null } = options;

  // Get patient info
  const refDoctor = PatientService.getRefDoctorInfo(order);
  const partner = PatientService.getPartnerInfo(order);
  const reportRefId = PatientService.getReportRefId(order);
  const dates = PatientService.getOrderDates(order);

  // Patient age and gender
  const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
  const gender = patient.gender ? patient.gender.toUpperCase() : "N/A";

  // Patient details object (same for all pages)
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
  };

  // Generate all page content
  let allPagesHtml = '';
  
  if (pages && pages.length > 0) {
    allPagesHtml = pages.map((page, idx) => {
      const isLastPage = idx === pages.length - 1;
      return generatePageHtml(page, patientDetails, isLastPage, headerImg, footerImg);
    }).join('');
    
    // Always add conditions as a separate page
    allPagesHtml += generateConditionsPage(patientDetails, headerImg, footerImg);
  } else {
    // Fallback if no pages
    allPagesHtml = generatePageHtml(null, patientDetails, true, headerImg, footerImg);
    allPagesHtml += generateConditionsPage(patientDetails, headerImg, footerImg);
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Medical Report</title>
        <style>
          /* SIMPLE RESET */
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5; color: #000; }
          .page-break { page-break-before: always; }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background: white;">
        ${allPagesHtml}
      </body>
    </html>
  `;
}

/**
 * Generate page HTML with optional header/footer images
 */
function generatePageHtml(page, patientDetails, isLastPage, headerImg = null, footerImg = null) {
  // Test title
  let testTitle = "Medical Report";
  
  if (page) {
    const partSuffix = page.chunkCount > 1 ? 
      ` (Part ${page.chunkIndex + 1}/${page.chunkCount})` : '';
    testTitle = `${page.testName || "Test"}${partSuffix}`;
  }

  // Main content
  let contentHtml = "";
  if (page && page.isRadiology && page.reportChunk) {
    contentHtml = `<div style="font-size: 13px; line-height: 1.6;">${page.reportChunk}</div>`;
  } else if (page && page.chunk && page.chunk.length > 0) {
    contentHtml = generatePathologyTable(page.chunk);
  } else {
    contentHtml = "<p>No test content available.</p>";
  }

  // Signatures (only on last page of test)
  let signatureHtml = "";
  if (page && page.result && page.chunkIndex === page.chunkCount - 1) {
    signatureHtml = generateSignatures(page.result);
  }

  // Calculate header/footer heights - INCREASED FOOTER HEIGHT
  const headerHeight = headerImg ? "110px" : "70px";
  const footerHeight = footerImg ? "120px" : "80px"; // Increased from 65px/40px
  
  // Calculate content area height
  const pageHeight = "297mm"; // A4 height in mm
  const contentTop = `calc(${headerHeight} + 190px)`; // Header + patient details card
  const contentHeight = `calc(${pageHeight} - ${headerHeight} - 190px - ${footerHeight})`;

  return `
    <!-- PAGE CONTAINER -->
    <div style="width: 210mm; height: ${pageHeight}; margin: 0 auto; padding: 0; page-break-after: always; background: white; position: relative; overflow: hidden;">
      
      <!-- HEADER AREA -->
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: ${headerHeight}; z-index: 10;">
        ${headerImg ? `
          <!-- HEADER IMAGE -->
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            <img src="${headerImg}" alt="Header" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          </div>
        ` : `
          <!-- BLANK HEADER SPACE -->
          <div style="height: 70px; width: 100%; background: transparent;"></div>
        `}
      </div>
      
      <!-- PATIENT DETAILS - 3 COLUMNS -->
      <div style="position: absolute; top: ${headerHeight}; width: 100%; z-index: 5;">
        <div style="width: 190mm; margin: 25px auto;">

          <!-- PATIENT DETAILS CARD -->
          <div style="border: 1px solid #E5E7EB; border-radius: 12px; background: #FFFFFF; overflow: hidden;">
            <!-- Top strip -->
            <div style="height: 6px; background: #F9FAFB;"></div>

            <div style="display: flex;">
              <!-- COL 1 -->
              <div style="flex: 1; padding: 14px 16px;">
                <div style="font-size: 20px; font-weight: 800; color: #111827; line-height: 1.1; margin-bottom: 6px;">
                  ${escapeHtml(patientDetails.name)}
                </div>
                <div style="font-size: 12px;">
                  <div style="display:flex; align-items:start; margin-bottom: 6px;">
                    <div style="font-size: 13px; color:#000000;">
                      ${escapeHtml(patientDetails.age)}/${escapeHtml(patientDetails.gender)}
                    </div>
                  </div>
                  <div style="display:flex; align-items:start;">
                    <div style="font-size: 13px; color:#000000;">
                      ${escapeHtml(patientDetails.partner || "N/A")}
                    </div>
                  </div>
                </div>
              </div>

              <!-- VERTICAL DIVIDER -->
              <div style="width: 1px; background: #E5E7EB;"></div>

              <!-- COL 2 -->
              <div style="flex: 1; padding: 14px 16px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px;">
                  <div style="font-size: 12px; color: #9CA3AF; min-width: 72px;">Report ID</div>
                  <div style="font-size: 13px; font-weight: 700; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; text-align:right;">
                    ${escapeHtml(patientDetails.reportRefId)}
                  </div>
                </div>

                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px;">
                  <div style="font-size: 12px; color: #9CA3AF; min-width: 72px;">Patient ID</div>
                  <div style="font-size: 13px; font-weight: 700; color: #111827; text-align:right;">
                    ${escapeHtml(patientDetails.patientId)}
                  </div>
                </div>

                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 10px;">
                  <div style="font-size: 12px; color: #9CA3AF; min-width: 72px;">Ref. by</div>
                  <div style="font-size: 13px; color: #374151; font-weight: 600; text-align:right;">
                    ${escapeHtml(patientDetails.refBy || "N/A")}
                  </div>
                </div>
              </div>

              <!-- VERTICAL DIVIDER -->
              <div style="width: 1px; background: #E5E7EB;"></div>

              <!-- COL 3 -->
              <div style="flex: 1; padding: 14px 16px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 10px;">
                  <div style="font-size: 11px; color: #9CA3AF; min-width: 72px;">Collected</div>
                  <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                    ${escapeHtml(patientDetails.collected)}
                  </div>
                </div>

                <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 10px;">
                  <div style="font-size: 11px; color: #9CA3AF; min-width: 72px;">Received</div>
                  <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                    ${escapeHtml(patientDetails.received)}
                  </div>
                </div>

                <div style="display:flex; align-items:flex-start; justify-content:space-between;">
                  <div style="font-size: 11px; color: #9CA3AF; min-width: 72px;">Reported</div>
                  <div style="font-size: 13px; color: #374151; font-weight: 700; text-align:right;">
                    ${escapeHtml(patientDetails.reported)}
                  </div>
                </div>
              </div>
            </div>

            <!-- Bottom line -->
            <div style="height: 1px; background: #F3F4F6;"></div>
          </div>
        </div>
      </div>
      
      <!-- CONTENT AREA -->
      <div style="position: absolute; top: ${contentTop}; bottom: ${footerHeight}; width: 100%; overflow: hidden; z-index: 1;">
        <div style="width: 190mm; margin: 0 auto; padding: 0; height: 100%; overflow-y: visible;">
          <div style="font-size: 16px; font-weight: 700; color: #000000;   ">
            ${escapeHtml(testTitle)}
          </div>
          
          <!-- Main content container with scroll prevention -->
          <div style="min-height: calc(100% - 60px); max-height: 100%; overflow-y: visible;">
            ${contentHtml}
            ${signatureHtml}
          </div>
        </div>
      </div>
      
      <!-- FOOTER AREA - INCREASED HEIGHT -->
      <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${footerHeight}; z-index: 10;">
        ${footerImg ? `
          <!-- FOOTER IMAGE -->
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: white;">
            <img src="${footerImg}" alt="Footer" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          </div>
        ` : `
          <!-- BLANK FOOTER SPACE -->
          <div style="height: 80px; width: 100%; background: transparent;"></div>
        `}
      </div>
    </div>
  `;
}

/**
 * Generate a dedicated page for conditions
 */
function generateConditionsPage(patientDetails, headerImg = null, footerImg = null) {
  const headerHeight = headerImg ? "110px" : "70px";
  const footerHeight = footerImg ? "120px" : "80px"; // Increased footer height
  const pageHeight = "297mm";
  
  return `
    <!-- CONDITIONS PAGE -->
    <div style="width: 210mm; height: ${pageHeight}; margin: 0 auto; padding: 0; page-break-before: always; background: white; position: relative; overflow: hidden;">
      
      <!-- HEADER AREA -->
      <div style="position: absolute; top: 0; left: 0; width: 100%; height: ${headerHeight}; z-index: 10;">
        ${headerImg ? `
          <!-- HEADER IMAGE -->
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            <img src="${headerImg}" alt="Header" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          </div>
        ` : `
          <!-- BLANK HEADER SPACE -->
          <div style="height: 70px; width: 100%; background: transparent;"></div>
        `}
      </div>
      
      <!-- CONTENT AREA - CONDITIONS ONLY -->
      <div style="position: absolute; top: ${headerHeight}; bottom: ${footerHeight}; width: 100%; padding: 40px 0;">
        <div style="width: 180mm; margin: 0 auto; padding: 20px; height: 100%; overflow-y: visible;">
          ${generateConditionsHtml()}
        </div>
      </div>
      
      <!-- FOOTER AREA - INCREASED HEIGHT -->
      <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${footerHeight}; z-index: 10;">
        ${footerImg ? `
          <!-- FOOTER IMAGE -->
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: white;">
            <img src="${footerImg}" alt="Footer" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          </div>
        ` : `
          <!-- BLANK FOOTER SPACE -->
          <div style="height: 80px; width: 100%; background: transparent;"></div>
        `}
      </div>
    </div>
  `;
}

/**
 * Generate conditions HTML
 */
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
      
      <!-- COMPANY ADDRESS FOOTER -->
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

/**
 * Generate pathology table with inline styles
 */
function generatePathologyTable(chunk) {
  if (!chunk || chunk.length === 0) {
    return '<p>No parameters to display</p>';
  }

  const rows = chunk.map(item => {
    const paramName = escapeHtml(item.parameter?.name || item.parameterName || "—");
    const method = escapeHtml(item.method || item.parameter?.method || "");
    const value = item.valueNumber ?? item.valueText ?? "";
    const unit = escapeHtml(item.unit || item.parameter?.unit || "");
    
    // Get reference range
    let range = "";
    let lowerLimit = null;
    let upperLimit = null;
    
    if (item.normalRangeText) {
      range = item.normalRangeText;
    } else if (item.parameter?.ranges?.[0]?.referenceRange) {
      range = item.parameter.ranges[0].referenceRange;
    } else if (item.parameter?.lowerLimit !== null || item.parameter?.upperLimit !== null) {
      lowerLimit = item.parameter.lowerLimit;
      upperLimit = item.parameter.upperLimit;
      
      if (lowerLimit !== null || upperLimit !== null) {
        range = `${lowerLimit !== null ? String(lowerLimit) : ''}${lowerLimit !== null && upperLimit !== null ? ' - ' : ''}${upperLimit !== null ? String(upperLimit) : ''}`.trim();
      }
    }

    // Determine if value is abnormal (low or high)
    let statusIndicator = "";
    const numericValue = parseFloat(value);
    
    if (!isNaN(numericValue) && (lowerLimit !== null || upperLimit !== null)) {
      const isLow = lowerLimit !== null && numericValue < lowerLimit;
      const isHigh = upperLimit !== null && numericValue > upperLimit;
      
      if (isLow) {
        statusIndicator = `
          <span style="color: #dc2626; font-weight: bold; margin-left: 8px;">
            ↓
            <span style="font-size: 12px; margin-left: 2px;">Low</span>
          </span>
        `;
      } else if (isHigh) {
        statusIndicator = `
          <span style="color: #dc2626; font-weight: bold; margin-left: 8px;">
            ↑
            <span style="font-size: 12px; margin-left: 2px;">High</span>
          </span>
        `;
      } else {
        statusIndicator = `
          <span style="color: #16a34a; font-weight: bold; margin-left: 8px;">
            ✓
            <span style="font-size: 12px; margin-left: 2px;">Normal</span>
          </span>
        `;
      }
    }

    // Format value with status indicator
    const valueHtml = `
      <div style="display: flex; align-items: center;">
        <span>${escapeHtml(value) || "—"}</span>
        ${statusIndicator}
      </div>
    `;

    return `
      <tr>
        <td style="padding: 5px 5px; vertical-align: top; ">
          <div style="font-weight: 600; font-size: 14px; color: #000000">${paramName}</div>
          ${method ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px; font-style: italic;">${method}</div>` : ''}
        </td>
        <td style="padding: 12px 12px; font-size: 14px; vertical-align: top; ">${valueHtml}</td>
        <td style="padding: 12px 12px; font-size: 14px; vertical-align: top; ">${unit || "—"}</td>
        <td style="padding: 12px 12px; font-size: 14px; vertical-align: top; ">${escapeHtml(range) || "—"}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="margin: 20px 0; border-radius: 8px; overflow: hidden; ">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 45%; padding: 14px 12px; background: #f3f4f6; text-align: left; font-weight: 700; font-size: 14px; color: #000000; ">
              TEST
            </th>
            <th style="width: 20%; padding: 14px 12px; background: #f3f4f6; text-align: left; font-weight: 700; font-size: 14px; color: #000000; ">
              RESULT
            </th>
            <th style="width: 15%; padding: 14px 12px; background: #f3f4f6; text-align: left; font-weight: 700; font-size: 14px; color: #000000; ">
              UNITS
            </th>
            <th style="width: 25%; padding: 14px 12px; background: #f3f4f6; text-align: left; font-weight: 700; font-size: 14px; color: #000000; ">
              RANGE
            </th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Generate signatures HTML with inline styles
 */
function generateSignatures(result) {
  const sigLeft = result?.sigLeft;
  const sigCenter = result?.sigCenter;
  const sigRight = result?.sigRight;

  if (!sigLeft && !sigCenter && !sigRight) {
    return "";
  }

  return `
    <div style="margin: 40px 0 30px 0; padding-top: 20px; border-top: 2px solid #dee2e6;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        ${generateSignatureColumn(sigLeft)}
        ${generateSignatureColumn(sigCenter)}
        ${generateSignatureColumn(sigRight)}
      </div>
    </div>
  `;
}

/**
 * Generate signature column with inline styles
 */
function generateSignatureColumn(sig) {
  if (!sig) {
    return '<div style="flex: 1; text-align: center; min-height: 90px; padding: 0 15px;"></div>';
  }

  const name = escapeHtml(sig.name || "");
  const title = escapeHtml(sig.designation || sig.qualification || "");
  const imageUrl = sig.signatureImg || sig.imageUrl || "";

  return `
    <div style="flex: 1; text-align: center; min-height: 90px; padding: 0 15px;">
      ${imageUrl ? `<img src="${imageUrl}" alt="Signature" style="max-height: 60px; max-width: 180px; margin-bottom: 8px; display: inline-block;">` : ''}
      <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #212529;">${name}</div>
      <div style="font-size: 11px; color: #6c757d; font-style: italic;">${title}</div>
    </div>
  `;
}

/**
 * Generate full PDF with cover pages and header/footer
 */
async function generateFullPdf(options) {
  const { browser, order, patient, results, layout, optimizedImages } = options;

  const pdfBuffers = [];

  // 1. Add cover page if exists
  if (optimizedImages.cover) {
    console.log("Adding cover page...");
    const coverPdf = await generateSingleImagePagePdf(browser, optimizedImages.cover);
    pdfBuffers.push(coverPdf);
  }

  // 2. Generate letterhead PDF with header/footer images
  console.log("Generating letterhead pages...");
  const letterheadPdf = await generateLetterheadPdf({
    browser,
    order,
    patient,
    results,
    headerImg: optimizedImages.header,
    footerImg: optimizedImages.footer,
  });
  pdfBuffers.push(letterheadPdf);

  // 3. Add last page if exists
  if (optimizedImages.last) {
    console.log("Adding last page...");
    const lastPdf = await generateSingleImagePagePdf(browser, optimizedImages.last);
    pdfBuffers.push(lastPdf);
  }

  // Merge all PDFs
  if (pdfBuffers.length > 1) {
    console.log(`Merging ${pdfBuffers.length} PDFs...`);
    return PdfUtils.mergePdfs(pdfBuffers);
  }

  return letterheadPdf;
}

/**
 * Utility functions
 */
function calculateAge(dob) {
  if (!dob) return "N/A";
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatDateTime(date) {
  if (!date) return "—";
  try {
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

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}