import { patientStripHtml } from "./partials/patientStrip.js";
import { resultsTableHtml } from "./partials/resultsTable.js";
import { signaturesHtml } from "./partials/signatures.js";

export function buildHtml({ reportData, variant }) {
  const { order, patient, layout, results, derived, signatures, trendMap } = reportData;

  const headerLocal = "images/_header.png";
  const footerLocal = "images/_footer.png";

  const pageClass = variant === "plain" ? "page plain" : "page";
  
  // Generate patient strip HTML once
  const patientStrip = patientStripHtml({ order, patient, derived });
  
  // For letterhead and full: header + patient strip together, plus footer
  // For plain: only patient strip (no header/footer)
  const runningElements = variant === "plain" ? `
<!-- Running patient strip only (no header/footer) -->
<div class="patient-strip-only">
  ${patientStrip}
</div>` : `
<!-- Running header with patient strip -->
<div class="header-with-patient">
  <div class="hdr">
    <img class="hf-img" src="${headerLocal}"/>
  </div>
  ${patientStrip}
</div>

<!-- Running footer -->
<div class="page-footer">
  <img class="hf-img" src="${footerLocal}" />
</div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="css/report.css" />
</head>
<body>

${runningElements}

<!-- Main content -->
<div class="${pageClass}">
  <div class="content">
${resultsTableHtml({ results, variant, trendMap })}

${signaturesHtml({ signatures })}
  </div>
</div>

</body>
</html>`;
}