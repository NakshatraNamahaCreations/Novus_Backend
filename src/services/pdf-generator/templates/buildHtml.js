// templates/buildHtml.js
import QRCode from "qrcode";
import { patientStripHtml } from "./partials/patientStrip.js";
import { resultsTableHtml } from "./partials/resultsTable.js";
import { compressHtmlImages } from "../utils/compressHtmlImages.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── SVG external-link icon ────────────────────────────────────
const LINK_ICON = `<svg class="idx-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  <polyline points="15 3 21 3 21 9"/>
  <line x1="10" y1="14" x2="21" y2="3"/>
</svg>`;

// ── Generate QR code as base64 data URL ──────────────────────
async function generateQrDataUrl(url) {
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, {
      width: 80,
      margin: 1,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

/**
 * Fetch a remote image and return a base64 data URL.
 * Used to embed the lab logo/stamp directly into the HTML
 * so PrinceXML doesn't need a second network fetch.
 */
async function fetchAsDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/png";
    const b64 = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

// ── Patient details strip for index page ─────────────────────
function buildIndexPatientStrip({ patient, order }) {
  const name = esc(patient?.fullName || patient?.name || "—");
  const initial = esc(patient?.initial || "");
  const age = patient?.age ?? "—";
  const gender = esc(patient?.gender || "—");
  const patientId = esc(String(patient?.id || "—"));

  return `
    <div class="idx-patient-strip">
      <div class="idx-patient-title">PATIENT DETAILS</div>
      <div class="idx-patient-grid">
        <div class="idx-patient-cell">
          <span class="idx-patient-label">Name</span>
          <span class="idx-patient-value">${initial ? initial + " " : ""}${name}</span>
        </div>
        <div class="idx-patient-cell">
          <span class="idx-patient-label">Age / Gender</span>
          <span class="idx-patient-value">${age} / ${gender}</span>
        </div>
        <div class="idx-patient-cell">
          <span class="idx-patient-label">Patient ID</span>
          <span class="idx-patient-value">${patientId}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Standalone index page ─────────────────────────────────────
function buildIndexPage(indexItems = [], { patient, order, derived } = {}) {
  if (!indexItems.length) return "";

  const totalTests = indexItems.length;

  const deptMap = new Map();
  for (const item of indexItems) {
    const d = item.dept || "General Tests";
    if (!deptMap.has(d)) deptMap.set(d, []);
    deptMap.get(d).push(item);
  }

  const sections = [...deptMap.entries()]
    .map(([deptName, items]) => {
      const rows = items
        .map(
          (it, i) => `
      <tr class="idx-row">
        <td class="idx-num">${String(i + 1).padStart(2, "0")}</td>
        <td class="idx-name-cell">
          <a class="idx-test-link" href="#${esc(it.id)}">
            <span class="idx-dot"></span>
            ${esc(it.title)}
          </a>
        </td>
        <td class="idx-type-cell">
          <span class="badge badge-${(it.type || "").toLowerCase()}">${esc(it.type || "")}</span>
        </td>
        <td class="idx-page-cell">
          <a class="idx-page-link" href="#${esc(it.id)}">${LINK_ICON}</a>
        </td>
      </tr>
    `
        )
        .join("");

      return `
      <div class="idx-section">
        <div class="idx-dept-header">
          <div class="idx-dept-icon"></div>
          <span class="idx-dept-name">${esc(deptName)}</span>
          <span class="idx-dept-count">${items.length} test${items.length > 1 ? "s" : ""}</span>
        </div>
        <table class="idx-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th class="th-name">Test Name</th>
              <th class="th-type">Type</th>
              <th class="th-page"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    })
    .join("");

  return `
    <div class="index-only-page">
      <div class="hdr">
        <img class="hf-img" src="images/_header.png" alt="Header" />
      </div>
      ${buildIndexPatientStrip({ patient, order })}
      <div class="idx-page-header">
        <div class="idx-page-title">Report Index</div>
        <div class="idx-page-sub">
          This report contains <strong>${totalTests}</strong> test${totalTests > 1 ? "s" : ""}
        </div>
      </div>
      ${sections}
      <div class="idx-notice">
        <div class="idx-notice-icon">ℹ</div>
        <div class="idx-notice-text">
          Results should be interpreted by a qualified healthcare professional.
          For any queries, contact your healthcare provider or lab directly.
        </div>
      </div>
    </div>
  `;
}

// ── End of Report ─────────────────────────────────────────────
const endOfReport = `
  <div class="end-of-report">
    <div class="end-of-report-line"></div>
    <span class="end-of-report-text">**** End of Report ****</span>
    <div class="end-of-report-line"></div>
  </div>
`;

// ── Conditions section ────────────────────────────────────────
const conditionsSection = `
  <div class="conditions-section keep-together">
    <div class="conditions-title">CONDITIONS OF LABORATORY TESTING &amp; REPORTING</div>
    <div class="conditions-content">
      <p>The test results reported herein pertain only to the specimen received and tested by Novus Health Labs.</p>
      <p>It is presumed that the specimen submitted belongs to the patient whose name and details appear on the test requisition form.</p>
      <p>Laboratory investigations are performed to assist the referring physician in clinical diagnosis and should be interpreted in correlation with the patient's clinical condition.</p>
      <p>All tests are performed using validated laboratory methods and internal quality control procedures.</p>
      <p>Test results are dependent on the quality, quantity, and integrity of the specimen received, as well as the analytical methodology used.</p>
      <p>Report delivery timelines are indicative and may be affected due to unforeseen technical or operational circumstances. Any inconvenience caused is regretted.</p>
    </div>
  </div>
`;

// ── Shared running header + footer HTML ───────────────────────
function runningElements(patientStripContent, headerSrc, footerSrc) {
  return `
    <div class="header-with-patient">
      <div class="hdr">
        <img class="hf-img" src="${esc(headerSrc)}" alt="Header" />
      </div>
      ${patientStripContent}
    </div>
    <div class="page-footer">
      <img class="hf-img" src="${esc(footerSrc)}" alt="Footer" />
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
//  buildHtml — async (QR + logo fetch + image compression)
// ═════════════════════════════════════════════════════════════
export async function buildHtml({ reportData, variant = "letterhead" }) {
  const { order, patient, layout, results, derived, trendMap } = reportData;

  // ── Resolve report URL for QR ──────────────────────────────
  const reportUrl =
    derived?.reportUrl ||
    order?.reportUrl ||
    (order?.id
      ? `https://novus-images.s3.ap-southeast-2.amazonaws.com/reports/order-${order.id}/patient-${order.patient.id}/full.pdf`
      : null);

  // ── Resolve lab logo/stamp URL ─────────────────────────────
  const logoUrl =
    layout?.stampImg ||
    layout?.logoImg ||
    order?.center?.stampImg ||
    order?.center?.logoImg ||
    null;

  // Fetch QR and logo in parallel
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    generateQrDataUrl(reportUrl),
    fetchAsDataUrl(logoUrl),
  ]);

  const patientStripContent = patientStripHtml({
    order,
    patient,
    derived,
    qrDataUrl,
    logoDataUrl,
  });

  const headerSrc = "images/_header.png";
  const footerSrc = "images/_footer.png";
  const plainImg =
    "https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png";

  // ── FULL variant ─────────────────────────────────────────────
  if (variant === "full") {
    const hasFrontPage = layout?.frontPageLastImg;
    const hasLastPage = layout?.lastPageImg;

    const { html: resultsContentRaw, indexItems } = resultsTableHtml({
      results,
      trendMap,
      returnMeta: true,
      showTrends: true,
    });

    // ✅ Compress all embedded base64 images (radiology Quill images)
    const resultsContent = await compressHtmlImages(resultsContentRaw);

    const indexPageContent = buildIndexPage(indexItems, {
      patient,
      order,
      derived,
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Full</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  ${
    hasFrontPage
      ? `
  <div class="image-page">
    <img class="fullpage-img" src="images/_frontPageLast.jpg" alt="Front Page" />
  </div>`
      : ""
  }

  ${indexPageContent}

  <div class="results-page">
    ${runningElements(patientStripContent, headerSrc, footerSrc)}
    <div class="content">
      ${resultsContent}
      ${endOfReport}
      ${conditionsSection}
    </div>
  </div>

  ${
    hasLastPage
      ? `
  <div class="image-page">
    <img class="fullpage-img" src="images/_lastPage.jpg" alt="Last Page" />
  </div>`
      : ""
  }

</body>
</html>`;
  }

  // ── LETTERHEAD variant ───────────────────────────────────────
  if (variant === "letterhead") {
    const resultsContentRaw = resultsTableHtml({
      results,
      trendMap,
      showTrends: false,
    });

    // ✅ Compress all embedded base64 images (radiology Quill images)
    const resultsContent = await compressHtmlImages(resultsContentRaw);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Letterhead</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  <div class="results-page">
    ${runningElements(patientStripContent, headerSrc, footerSrc)}
    <div class="content">
      ${resultsContent}
      ${endOfReport}
      ${conditionsSection}
    </div>
  </div>

</body>
</html>`;
  }

  // ── PLAIN variant ────────────────────────────────────────────
  const resultsContentRaw = resultsTableHtml({
    results,
    trendMap,
    showTrends: false,
  });

  // ✅ Compress all embedded base64 images (radiology Quill images)
  const resultsContent = await compressHtmlImages(resultsContentRaw);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Plain</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  <div class="plain-page">
    ${runningElements(patientStripContent, plainImg, plainImg)}
    <div class="content">
      ${resultsContent}
      ${endOfReport}
      ${conditionsSection}
    </div>
  </div>

</body>
</html>`;
}