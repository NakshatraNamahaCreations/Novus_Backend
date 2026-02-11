// templates/buildHtml.js
import { patientStripHtml } from "./partials/patientStrip.js";
import { resultsTableHtml } from "./partials/resultsTable.js";
import { signaturesHtml } from "./partials/signatures.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildIndexPage({ patient, order, indexItems }) {
  const totalTests = indexItems.length;

  const grouped = indexItems.reduce((acc, it) => {
    const g = it.group || "General Tests";
    acc[g] = acc[g] || [];
    acc[g].push(it);
    return acc;
  }, {});

  return `
    <div class="report-index-page break-after">
      

      <div class="idx-title">Report Index</div>
      <div class="idx-hint">Click on any test name to navigate directly to that section</div>

      ${Object.keys(grouped)
        .map((groupName) => {
          const items = grouped[groupName];
          return `
            <div class="idx-group">
              <div class="idx-group-title">${esc(groupName)}</div>
              <div class="idx-list">
                ${items
                  .map((it) => {
                    const href = `#${it.id}`;
                    const params = it.paramCount
                      ? `${it.paramCount} parameters`
                      : "";
                    return `
                      <a class="idx-row" href="${esc(href)}">
                        <div class="idx-left">
                          <div class="idx-doc"></div>
                          <div class="idx-text">
                            <div class="idx-row-title">${esc(it.title)}</div>
                            <div class="idx-row-sub">${esc(params)}</div>
                          </div>
                        </div>
                        <div class="idx-right">
                          <span class="idx-page-auto"></span>
                          <span class="idx-arrow">›</span>
                        </div>
                      </a>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}

      <div class="idx-note">
        <div class="idx-note-title">Important Notes</div>
        <ul>
          <li>This report contains ${totalTests} tests.</li>
          <li>Results should be interpreted by a qualified healthcare professional.</li>
          <li>For any queries, contact your healthcare provider or lab directly.</li>
        </ul>
      </div>
    </div>
  `;
}

export function buildHtml({ reportData, variant = "letterhead" }) {
  const { order, patient, layout, results, signatures, derived, trendMap } =
    reportData;

  const patientStripContent = patientStripHtml({ order, patient, derived });

  const sigContent = signaturesHtml({ signatures });

  const conditionsSection = `
    <div class="conditions-section keep-together">
      <div class="conditions-title">CONDITIONS OF LABORATORY TESTING & REPORTING</div>
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

  if (variant === "full") {
    const hasFrontPage = layout?.frontPageLastImg;
    const hasLastPage = layout?.lastPageImg;

    // ✅ get results HTML + index items
    const { html: resultsContent, indexItems } = resultsTableHtml({
      results,
      trendMap,
      returnMeta: true,
    });

    const indexPage = buildIndexPage({ patient, order, indexItems });

    return `
<!DOCTYPE html>
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
  <!-- Front Page -->
  <div class="image-page">
    <img class="fullpage-img" src="images/_frontPageLast.jpg" alt="Front Page" />
  </div>
  `
      : ""
  }

  <!-- Running header -->
  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img" src="images/_header.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <!-- Running footer -->
  <div class="page-footer">
    <img class="hf-img" src="images/_footer.png" alt="Footer" />
  </div>

  <!-- ✅ Index Page must be the first content page after front image -->
  <div class="page">
    <div class="content">
      ${indexPage}
      ${resultsContent}
      ${sigContent}
      ${conditionsSection}
    </div>
  </div>

  ${
    hasLastPage
      ? `
  <!-- Last Page -->
  <div class="image-page break-before">
    <img class="fullpage-img" src="images/_lastPage.jpg" alt="Last Page" />
  </div>
  `
      : ""
  }

</body>
</html>
    `;
  }

  // unchanged: letterhead/plain can keep your current return
  const resultsContent = resultsTableHtml({ results, trendMap });

  if (variant === "letterhead") {
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
    <div class="hdr"><img class="hf-img" src="images/_header.png" alt="Header" /></div>
    ${patientStripContent}
  </div>

  <div class="page-footer">
    <img class="hf-img" src="images/_footer.png" alt="Footer" />
  </div>

  <div class="page">
    <div class="content">
      ${resultsContent}
      ${sigContent}
      ${conditionsSection}
    </div>
  </div>
</body>
</html>
    `;
  }

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
      <img class="hf-img" src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <div class="page-footer">
    <img class="hf-img" src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png" alt="Footer" />
  </div>

  <div class="page">
    <div class="content">
      ${resultsContent}
      ${sigContent}
      ${conditionsSection}
    </div>
  </div>
</body>
</html>
  `;
}
