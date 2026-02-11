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
    .replace(/on\w+="[^"]*"/gi, "");
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

function isRadiology(r) {
  return !!r?.reportHtml && (!r?.parameterResults || r.parameterResults.length === 0);
}

function isPathology(r) {
  return Array.isArray(r?.parameterResults) && r.parameterResults.length > 0;
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * ✅ Updated:
 * - Adds anchors for each test section (Radiology + Pathology)
 * - Collects indexItems for TOC/Index page
 * - Supports returnMeta to return { html, indexItems }
 * - ✅ Adds 'with-trends' class to table when trends exist
 */
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

      // ✅ index meta
      indexItems.push({
        id,
        title: testName,
        paramCount: 0,
        group: "General Tests",
        type: "Radiology",
      });

      return `
        <div class="section radiology" id="${esc(id)}">
          <div class="section-title">${esc(testName)}</div>
          <div class="radio-html ql-scope">
            ${body || `<div class="muted">No content available</div>`}
          </div>
        </div>
      `;
    })
    .join("");

  // 2) Pathology section with trends
  const pathologyHtml = pathology
    .map((r) => {
      seq += 1;

      const testName = r?.test?.name || "Lab Test";
      const paramResults = r.parameterResults || [];
      const testId = r?.testId ?? r?.test?.id;

      const id = `test-${seq}-${slugify(testName)}`;

      // ✅ index meta
      indexItems.push({
        id,
        title: testName,
        paramCount: Array.isArray(paramResults) ? paramResults.length : 0,
        group: "General Tests",
        type: "Pathology",
      });

      // Check if we have any trends for this test
      const hasTrends =
        trendMap &&
        paramResults.some((pr) => {
          const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
          return trends.some((t) => t.value && t.value !== "—");
        });

      // Get trend dates (last 3 dates)
      let trendDates = ["", "", ""];
      if (hasTrends && trendMap) {
        const firstParam = paramResults[0];
        if (firstParam) {
          const trends = trendMap.get(`${testId}:${firstParam.parameterId}`) || [];
          trendDates = trends.map((t) => formatDate(t.date));
        }
      }

      // Get current date for result column
      const currentDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });

      const sectionClass =
        paramResults.length > 20
          ? "section pathology"
          : "section pathology keep-together";

      // ✅ Add 'with-trends' class to table when trends exist
      const tableClass = hasTrends ? "tbl with-trends" : "tbl";

      const rows = paramResults
        .map((pr) => {
          const pname = pr?.parameter?.name ?? pr?.parameterName ?? "";
          const method = pr?.parameter?.method ?? pr?.method ?? "";
          const value = formatValue(pr);
          const unit = formatUnit(pr);
          const ref = formatRef(pr);

          // Get trend values for this parameter
          let trend1 = "";
          let trend2 = "";
          let trend3 = "";

          if (hasTrends && trendMap) {
            const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
            trend1 = trends[0]?.value || "—";
            trend2 = trends[1]?.value || "—";
            trend3 = trends[2]?.value || "—";
          }

          const flag = pr?.flag;

          const isHigh = flag && (flag === "HIGH" || flag === "HH");
          const isLow = flag && (flag === "LOW" || flag === "LL");

          let valueClass = "";
          if (isHigh) valueClass = "abnormal-value high";
          else if (isLow) valueClass = "abnormal-value low";

          return `
            <tr>
              <td class="param-name-cell">
                <div class="param-name">${esc(pname)}</div>
                ${method ? `<div class="param-method">${esc(method)}</div>` : ""}
              </td>
              <td class="${valueClass}">${esc(value)}${unit ? " " + esc(unit) : ""}</td>
              <td class="ref-range">${esc(ref)}</td>
              ${
                hasTrends
                  ? `
                <td class="trend-value trend-value-first">${esc(trend1)}</td>
                <td class="trend-value">${esc(trend2)}</td>
                <td class="trend-value">${esc(trend3)}</td>
              `
                  : ""
              }
            </tr>
          `;
        })
        .join("");

      return `
        <div class="${sectionClass}" id="${esc(id)}">
          <div class="test-title-row">
            <div class="test-name-left">${esc(testName)}</div>
          </div>

          <table class="${tableClass}">
            <thead>
              ${
                hasTrends
                  ? `
              <tr>
                <th class="test-name-header">Test Name</th>
                <th class="result-header">Result (${currentDate})</th>
                <th class="bio-ref-header">Biological Reference</th>
                <th colspan="3" class="trend-header-group"> Historical Trends</th>
              </tr>
              <tr class="trend-dates-row">
                <th></th>
                <th></th>
                <th></th>
                <th class="trend-header trend-header-first">${trendDates[0] || "—"}</th>
                <th class="trend-header">${trendDates[1] || "—"}</th>
                <th class="trend-header">${trendDates[2] || "—"}</th>
              </tr>
              `
                  : `
              <tr>
                <th class="test-name-header">Test Name</th>
                <th class="result-header">Result (${currentDate})</th>
                <th class="bio-ref-header">Biological Reference</th>
              </tr>
              `
              }
            </thead>
            <tbody>
              ${
                rows ||
                `<tr><td colspan="${hasTrends ? "6" : "3"}" class="muted text-center">No parameters available</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

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

  const html = radiologyHtml + pathologyHtml;
  return returnMeta ? { html, indexItems } : html;
}