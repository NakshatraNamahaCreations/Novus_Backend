// templates/buildHtml.js
import { patientStripHtml } from "./partials/patientStrip.js";
import { resultsTableHtml } from "./partials/resultsTable.js";

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

// ── Patient details strip for index page ─────────────────────
function buildPatientStrip({ patient, order, derived }) {
  const name      = esc(patient?.fullName || patient?.name || "—");
  const initial   = esc(patient?.initial || "");
  const age       = patient?.age ?? "—";
  const gender    = esc(patient?.gender || "—");
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
// @page indexpage — no running header / footer
function buildIndexPage(indexItems = [], { patient, order, derived } = {}) {
  if (!indexItems.length) return "";

  const totalTests = indexItems.length;

  // Group by department
  const deptMap = new Map();
  for (const item of indexItems) {
    const d = item.dept || "General Tests";
    if (!deptMap.has(d)) deptMap.set(d, []);
    deptMap.get(d).push(item);
  }

  const sections = [...deptMap.entries()].map(([deptName, items]) => {
    const rows = items.map((it, i) => `
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
          <a class="idx-page-link" href="#${esc(it.id)}">
            ${LINK_ICON}
          </a>
        </td>
      </tr>
    `).join("");

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
  }).join("");

  return `
    <div class="index-only-page">
      <!-- Header image -->
      <div class="hdr">
        <img class="hf-img" src="images/_header.png" alt="Header" />
      </div>

      ${buildPatientStrip({ patient, order, derived })}

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

// ═════════════════════════════════════════════════════════════
export function buildHtml({ reportData, variant = "letterhead" }) {
  const { order, patient, layout, results, derived, trendMap } = reportData;

  const patientStripContent = patientStripHtml({ order, patient, derived });

  // ── FULL variant ─────────────────────────────────────────────
  // ✅ Only "full" renders Historical Trends (showTrends defaults to true)
  if (variant === "full") {
    const hasFrontPage = layout?.frontPageLastImg;
    const hasLastPage  = layout?.lastPageImg;

    const { html: resultsContent, indexItems } = resultsTableHtml({
      results,
      trendMap,
      returnMeta: true,
      showTrends: true,   // ✅ Trends shown only in full variant
    });

    const indexPageContent = buildIndexPage(indexItems, { patient, order, derived });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Full</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  ${hasFrontPage ? `
  <!-- PAGE 1: Full-bleed front cover -->
  <div class="image-page">
    <img class="fullpage-img" src="images/_frontPageLast.jpg" alt="Front Page" />
  </div>
  ` : ""}

  <!-- PAGE 2: Clean index — NO header/patient stripe/footer.
       Placed BEFORE running elements so PrinceXML does not create
       a blank default @page to register them. -->
  ${indexPageContent}

  <!-- PAGE 3+: Results.
       Running header/footer declared INSIDE .results-page so they
       only register once content starts — no blank page. -->
  <div class="results-page">

    <div class="header-with-patient">
      <div class="hdr">
        <img class="hf-img" src="images/_header.png" alt="Header" />
      </div>
      ${patientStripContent}
    </div>

    <div class="page-footer">
      <img class="hf-img" src="images/_footer.png" alt="Footer" />
    </div>

    <div class="content">
      ${resultsContent}
      ${conditionsSection}
    </div>

  </div>

  ${hasLastPage ? `
  <!-- Last page -->
  <div class="image-page">
    <img class="fullpage-img" src="images/_lastPage.jpg" alt="Last Page" />
  </div>
  ` : ""}

</body>
</html>
    `;
  }

  // ── LETTERHEAD variant ───────────────────────────────────────
  // ✅ FIX: showTrends: false — no Historical Trends in letterhead
  if (variant === "letterhead") {
    const resultsContent = resultsTableHtml({
      results,
      trendMap,
      showTrends: false,
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Letterhead</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img" src="images/_header.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <div class="page-footer">
    <img class="hf-img" src="images/_footer.png" alt="Footer" />
  </div>

  <div class="results-page">
    <div class="content">
      ${resultsContent}
      ${conditionsSection}
    </div>
  </div>

</body>
</html>
    `;
  }

  // ── PLAIN variant ────────────────────────────────────────────
  // ✅ FIX: showTrends: false — no Historical Trends in plain
  const resultsContent = resultsTableHtml({
    results,
    trendMap,
    showTrends: false,
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Plain</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>

  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img"
        src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png"
        alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <div class="page-footer">
    <img class="hf-img"
      src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png"
      alt="Footer" />
  </div>

  <div class="results-page">
    <div class="content">
      ${resultsContent}
      ${conditionsSection}
    </div>
  </div>

</body>
</html>
  `;
}