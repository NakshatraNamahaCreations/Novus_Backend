function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
}


function formatValue(pr) {
  const vn = pr?.valueNumber;
  const vt = pr?.valueText;

  const v =
    (vn !== null && vn !== undefined ? vn : null) ??
    (vt !== null && vt !== undefined ? vt : null) ??
    pr?.value ??
    pr?.result ??
    pr?.resultValue ??
    pr?.observedValue ??
    pr?.displayValue ??
    "";

  return v === null || v === undefined ? "" : String(v);
}

function formatUnit(pr) {
  return pr?.unit ?? pr?.parameter?.unit ?? pr?.uom ?? "";
}

function formatRef(pr) {
  return (
    pr?.normalRangeText ??
    pr?.referenceRange ??
    pr?.parameter?.referenceRange ??
    ""
  );
}

function renderNotesBlock(notes) {
  const notesHtml = sanitizeHtml(notes || "");
  if (!notesHtml.trim()) return "";
  return `
    <div class="test-notes">
      <div class="test-notes-title">Notes</div>
      <div class="test-notes-body ql-scope">
        ${notesHtml}
      </div>
    </div>
  `;
}


function isRadiology(r) {
  return (
    !!r?.reportHtml && (!r?.parameterResults || r.parameterResults.length === 0)
  );
}

function isPathology(r) {
  return Array.isArray(r?.parameterResults) && r.parameterResults.length > 0;
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ✅ Generate signature HTML for a single test
function generateTestSignatures(result) {
  const signatures = {
    left: null,
    center: null,
    right: null,
  };

  // Map signatures to their positions
  if (result.leftSignature) {
    signatures.left = result.leftSignature;
  }

  if (result.centerSignature) {
    signatures.center = result.centerSignature;
  }

  if (result.rightSignature) {
    signatures.right = result.rightSignature;
  }

  // Check if we have any signatures
  if (!signatures.left && !signatures.center && !signatures.right) {
    return "";
  }

  const renderSignature = (sig) => {
    if (!sig) {
      return '<div class="sig-card sig-empty"></div>';
    }

    return `
      <div class="sig-card">
        ${
          sig.signatureImg
            ? `<img class="sig-img" src="${esc(sig.signatureImg)}" alt="Signature" />`
            : '<div class="muted">No signature</div>'
        }
        <div class="sig-name">${esc(sig.name)}</div>
        ${sig.qualification ? `<div class="sig-sub">${esc(sig.qualification)}</div>` : ""}
        ${sig.designation ? `<div class="sig-sub">${esc(sig.designation)}</div>` : ""}
      </div>
    `;
  };

  return `
    <div class="sig-wrap">
      <div class="sig-col sig-left">
        ${renderSignature(signatures.left)}
      </div>
      <div class="sig-col sig-center">
        ${renderSignature(signatures.center)}
      </div>
      <div class="sig-col sig-right">
        ${renderSignature(signatures.right)}
      </div>
    </div>
  `;
}

// ✅ NEW: Generate ALL trends at the end
function generateAllTrendsSection(pathologyResults, trendMap) {
  if (!trendMap || pathologyResults.length === 0) return "";

  // Collect all tests that have trends
  const testsWithTrends = [];

  pathologyResults.forEach((result) => {
    const testId = result?.testId ?? result?.test?.id;
    const testName = result?.test?.name || "Lab Test";
    const paramResults = result.parameterResults || [];

    // Check if this test has any trends
    const hasTrends = paramResults.some((pr) => {
      const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
      return trends.some((t) => t.value && t.value !== "—");
    });

    if (hasTrends) {
      testsWithTrends.push({
        testName,
        testId,
        paramResults,
      });
    }
  });

  if (testsWithTrends.length === 0) return "";

  // Get trend dates from first test's first parameter
  let trendDates = ["", "", ""];
  if (testsWithTrends[0]) {
    const firstParam = testsWithTrends[0].paramResults[0];
    if (firstParam) {
      const trends =
        trendMap.get(
          `${testsWithTrends[0].testId}:${firstParam.parameterId}`,
        ) || [];
      trendDates = trends.map((t) => formatDate(t.date));
    }
  }

  // Generate rows for all tests
  const allRows = testsWithTrends
    .map((test) => {
      const rows = test.paramResults
        .map((pr) => {
          const pname = pr?.parameter?.name ?? pr?.parameterName ?? "";
          const trends = trendMap.get(`${test.testId}:${pr.parameterId}`) || [];

          const trend1 = trends[0]?.value || "—";
          const trend2 = trends[1]?.value || "—";
          const trend3 = trends[2]?.value || "—";

          return `
        <tr>
          <td>${esc(pname)}</td>
          <td class="trend-value-cell ${trend1 === "—" ? "trend-no-data" : ""}">${esc(trend1)}</td>
          <td class="trend-value-cell ${trend2 === "—" ? "trend-no-data" : ""}">${esc(trend2)}</td>
          <td class="trend-value-cell ${trend3 === "—" ? "trend-no-data" : ""}">${esc(trend3)}</td>
        </tr>
      `;
        })
        .join("");

      // Add test name header row
      return `
      <tr class="trend-test-header">
        <td colspan="4">${esc(test.testName)}</td>
      </tr>
      ${rows}
    `;
    })
    .join("");

  return `
    <div class="trends-section keep-together">
      <div class="trends-header">
        <div class="trends-title">Historical Trends</div>
        <div class="trends-subtitle">Previous Results</div>
      </div>
      <div class="trends-table-wrapper">
        <table class="trends-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>${trendDates[0] || "—"}</th>
              <th>${trendDates[1] || "—"}</th>
              <th>${trendDates[2] || "—"}</th>
            </tr>
          </thead>
          <tbody>
            ${allRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function resultsTableHtml({ results, trendMap, returnMeta = false }) {
  const all = Array.isArray(results) ? results : [];
  const radiology = all.filter(isRadiology);
  const pathology = all.filter(isPathology);

  const indexItems = [];
  let seq = 0;

  // 1) Radiology section
  const radiologyHtml = radiology
    .map((r) => {
      seq += 1;

      const testName = r?.test?.name || "Radiology Report";
      const body = sanitizeHtml(r.reportHtml);

      const id = `test-${seq}-${slugify(testName)}`;

      indexItems.push({
        id,
        title: testName,
        paramCount: 0,
        group: "General Tests",
        type: "Radiology",
      });
const notesBlock = renderNotesBlock(r?.notes);
      const signaturesHtml = generateTestSignatures(r);

      return `
        <div class="section radiology" id="${esc(id)}">
          <div class="section-title">${esc(testName)}</div>
          <div class="radio-html ql-scope">
            ${body || `<div class="muted">No content available</div>`}
          </div>
            ${notesBlock}
          ${signaturesHtml}
        </div>
      `;
    })
    .join("");

  // 2) Pathology section - NO TRENDS, just results + signatures
  const pathologyHtml = pathology
    .map((r) => {
      seq += 1;

      const testName = r?.test?.name || "Lab Test";
      const paramResults = r.parameterResults || [];

      console.log("notes",r?.notes)

      const id = `test-${seq}-${slugify(testName)}`;

      indexItems.push({
        id,
        title: testName,
        paramCount: Array.isArray(paramResults) ? paramResults.length : 0,
        group: "General Tests",
        type: "Pathology",
      });

      const currentDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });

      const sectionClass =
        paramResults.length > 20
          ? "section pathology"
          : "section pathology keep-together";

      const rows = paramResults
        .map((pr) => {
          const pname = pr?.parameter?.name ?? pr?.parameterName ?? "";
          const method = pr?.parameter?.method ?? pr?.method ?? "";
          const value = formatValue(pr);
          const unit = formatUnit(pr);
          const ref = formatRef(pr);

          const flag = pr?.flag;
          const isHigh = flag && (flag === "HIGH" || flag === "HH");
          const isLow = flag && (flag === "LOW" || flag === "LL");

          let valueClass = "";
          if (isHigh) valueClass = "abnormal-value high";
          else if (isLow) valueClass = "abnormal-value low";

          const refRaw = formatRef(pr); // can be plain text OR HTML
          const refIsHtml = refRaw && /<\/?[a-z][\s\S]*>/i.test(refRaw);

          // ✅ only content (no <td> here)
          const refContent = refIsHtml ? sanitizeHtml(refRaw) : esc(refRaw);

          // ✅ single td only once
          return `
  <tr>
    <td class="param-name-cell">
      <div class="param-name">${esc(pname)}</div>
      ${method ? `<div class="param-method">${esc(method)}</div>` : ""}
    </td>

    <td class="${valueClass}">
      ${esc(value)}${unit ? " " + esc(unit) : ""}
    </td>

    <td class="ref-range ${refIsHtml ? "ref-html" : ""}">
      ${refContent || ""}
    </td>
  </tr>
`;
        })
        .join("");
        const notesBlock = renderNotesBlock(r?.notes);


      const signaturesHtml = generateTestSignatures(r);

      return `
        <div class="${sectionClass}" id="${esc(id)}">
          <div class="test-title-row">
            <div class="test-name-left">${esc(testName)}</div>
          </div>

          <table class="tbl">
            <thead>
              <tr>
                <th class="test-name-header">Test Name</th>
                <th class="result-header">Result (${currentDate})</th>
                <th class="bio-ref-header">Biological Reference</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="3" class="muted text-center">No parameters available</td></tr>`}
            </tbody>
          </table>
              ${notesBlock}
          ${signaturesHtml}
        </div>
      `;
    })
    .join("");

  // 3) ✅ Generate ALL trends section at the end
  const allTrendsHtml = generateAllTrendsSection(pathology, trendMap);

  if (!radiologyHtml && !pathologyHtml) {
    const html = `
      <div class="section">
        <div class="section-title">Laboratory Results</div>
        <table class="tbl">
          <tbody>
            <tr><td class="muted text-center">No results available</td></tr>
          </tbody>
        </table>
      </div>
    `;

    return returnMeta ? { html, indexItems: [] } : html;
  }

  const html = radiologyHtml + pathologyHtml + allTrendsHtml;
  return returnMeta ? { html, indexItems } : html;
}
