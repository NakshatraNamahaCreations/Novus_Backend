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

/**
 * Build HTML for PDF generation
 * @param {Object} reportData - All report data
 * @param {string} variant - "plain" | "letterhead" | "full"
 */
export function buildHtml({ reportData, variant = "letterhead" }) {
  const { order, patient, layout, results, signatures, derived, trendMap } = reportData;

  // Patient strip HTML (used in all variants)
  const patientStripContent = patientStripHtml({ order, patient, derived });

  // Results content
  const resultsContent = resultsTableHtml({ results, trendMap });

  // Signatures
  const signaturesContent = signaturesHtml({ signatures });

  // Conditions section (appears after results in all variants)
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

  // Build HTML based on variant
  if (variant === "full") {
    // Check if front and last page images exist
    const hasFrontPage = layout?.frontPageLastImg;
    const hasLastPage = layout?.lastPageImg;

    // Full variant: Conditional front page + content + conditions + conditional last page
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
  <!-- Front Page -->
  <div class="image-page">
    <img class="fullpage-img" src="images/_frontPageLast.jpg" alt="Front Page" />
  </div>
  ` : ''}

  <!-- Header with Patient Strip (running element) -->
  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img" src="images/_header.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <!-- Footer (running element) -->
  <div class="page-footer">
    <img class="hf-img" src="images/_footer.png" alt="Footer" />
  </div>

  <!-- Main Content -->
  <div class="page">
    <div class="content">
      ${resultsContent}
      ${signaturesContent}
      ${conditionsSection}
    </div>
  </div>

  ${hasLastPage ? `
  <!-- Last Page -->
  <div class="image-page break-before">
    <img class="fullpage-img" src="images/_lastPage.jpg" alt="Last Page" />
  </div>
  ` : ''}
</body>
</html>
    `;
  } else if (variant === "letterhead") {
    // Letterhead variant: Header + Footer with branding
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Letterhead</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>
  <!-- Header with Patient Strip (running element) -->
  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img" src="images/_header.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <!-- Footer (running element) -->
  <div class="page-footer">
    <img class="hf-img" src="images/_footer.png" alt="Footer" />
  </div>

  <!-- Main Content -->
  <div class="page">
    <div class="content">
      ${resultsContent}
      ${signaturesContent}
      ${conditionsSection}
    </div>
  </div>
</body>
</html>
    `;
  } else {
    // Plain variant: Plain header/footer image + patient strip on every page
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Report - Plain</title>
  <link rel="stylesheet" href="css/report.css">
</head>
<body>
  <!-- Plain Header with Patient Strip (running element) -->
  <div class="header-with-patient">
    <div class="hdr">
      <img class="hf-img" src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png" alt="Header" />
    </div>
    ${patientStripContent}
  </div>

  <!-- Plain Footer (running element) -->
  <div class="page-footer">
    <img class="hf-img" src="https://novus-images.s3.ap-southeast-2.amazonaws.com/Screenshot_14.png" alt="Footer" />
  </div>

  <!-- Main Content -->
  <div class="page">
    <div class="content">
      ${resultsContent}
      ${signaturesContent}
      ${conditionsSection}
    </div>
  </div>
</body>
</html>
    `;
  }
}