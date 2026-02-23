// ============================================================
//  resultsTableHtml.js  —  Complete results renderer
// ============================================================

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

function formatRefFromPRorItem(pr, itemParam) {
  const prRef = pr?.normalRangeText ?? pr?.referenceRange ?? "";
  if (prRef && String(prRef).trim()) return String(prRef);

  const ranges = itemParam?.ranges || [];
  if (ranges?.length) {
    const r0 = ranges[0];
    if (r0?.referenceRange && String(r0.referenceRange).trim())
      return String(r0.referenceRange);
    const hasLower = r0?.lowerLimit !== null && r0?.lowerLimit !== undefined;
    const hasUpper = r0?.upperLimit !== null && r0?.upperLimit !== undefined;
    if (hasLower || hasUpper) {
      const lower = hasLower ? String(r0.lowerLimit) : "";
      const upper = hasUpper ? String(r0.upperLimit) : "";
      return `${lower}${lower && upper ? " - " : ""}${upper}`.trim();
    }
    if (r0?.normalValueHtml && String(r0.normalValueHtml).trim())
      return String(r0.normalValueHtml);
  }
  return "";
}

function renderNotesBlock(notes) {
  const notesHtml = sanitizeHtml(notes || "");
  if (!notesHtml.trim()) return "";
  return `
    <div class="test-notes">
      <div class="test-notes-title">Notes</div>
      <div class="test-notes-body ql-scope">${notesHtml}</div>
    </div>
  `;
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

function buildParamResultMap(parameterResults = []) {
  const map = new Map();
  for (const pr of parameterResults || []) {
    if (pr?.parameterId != null) map.set(pr.parameterId, pr);
  }
  return map;
}

// ── Signature block — once per department group ──────────────
function generateTestSignatures(result) {
  const signatures = {
    left:   result?.leftSignature   || null,
    center: result?.centerSignature || null,
    right:  result?.rightSignature  || null,
  };
  if (!signatures.left && !signatures.center && !signatures.right) return "";

  const renderSig = (sig) => {
    if (!sig) return '<div class="sig-card sig-empty"></div>';
    return `
      <div class="sig-card">
        ${sig.signatureImg
          ? `<img class="sig-img" src="${esc(sig.signatureImg)}" alt="Signature" />`
          : '<div class="muted">No signature</div>'}
        <div class="sig-name">${esc(sig.name)}</div>
        ${sig.qualification ? `<div class="sig-sub">${esc(sig.qualification)}</div>` : ""}
        ${sig.designation   ? `<div class="sig-sub">${esc(sig.designation)}</div>`   : ""}
      </div>
    `;
  };

  return `
    <div class="sig-wrap">
      <div class="sig-col sig-left">${renderSig(signatures.left)}</div>
      <div class="sig-col sig-center">${renderSig(signatures.center)}</div>
      <div class="sig-col sig-right">${renderSig(signatures.right)}</div>
    </div>
  `;
}

// ── Department banner ────────────────────────────────────────
function renderDeptHeader(deptName) {
  if (!deptName) return "";
  return `
    <div class="dept-header">
      <span class="dept-header-title">${esc(deptName)}</span>
    </div>
  `;
}

// ── Group results by departmentItemId ────────────────────────
function groupByDepartment(arr) {
  const groups = [];
  const map = new Map();
  for (const r of arr) {
    const key = r?.test?.departmentItemId ?? "none";
    if (!map.has(key)) {
      const g = {
        key,
        deptName: r?.test?.departmentItem?.name || null,
        results:  [],
      };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key).results.push(r);
  }
  return groups;
}

// ── Historical trends ────────────────────────────────────────
function generateAllTrendsSection(pathologyResults, trendMap) {
  if (!trendMap || pathologyResults.length === 0) return "";

  const testsWithTrends = [];
  pathologyResults.forEach((result) => {
    const testId       = result?.testId ?? result?.test?.id;
    const testName     = result?.test?.name || "Lab Test";
    const paramResults = result.parameterResults || [];
    const hasTrends    = paramResults.some((pr) => {
      const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
      return trends.some((t) => t.value && t.value !== "—");
    });
    if (hasTrends) testsWithTrends.push({ testName, testId, paramResults });
  });

  if (testsWithTrends.length === 0) return "";

  let trendDates = ["", "", ""];
  if (testsWithTrends[0]) {
    const firstParam = testsWithTrends[0].paramResults[0];
    if (firstParam) {
      const trends = trendMap.get(`${testsWithTrends[0].testId}:${firstParam.parameterId}`) || [];
      trendDates   = trends.map((t) => formatDate(t.date));
    }
  }

  const allRows = testsWithTrends.map((test) => {
    const rows = test.paramResults.map((pr) => {
      const pname  = pr?.parameter?.name ?? pr?.parameterName ?? "";
      const trends = trendMap.get(`${test.testId}:${pr.parameterId}`) || [];
      const t1 = trends[0]?.value || "—";
      const t2 = trends[1]?.value || "—";
      const t3 = trends[2]?.value || "—";
      return `
        <tr>
          <td>${esc(pname)}</td>
          <td class="trend-value-cell ${t1 === "—" ? "trend-no-data" : ""}">${esc(t1)}</td>
          <td class="trend-value-cell ${t2 === "—" ? "trend-no-data" : ""}">${esc(t2)}</td>
          <td class="trend-value-cell ${t3 === "—" ? "trend-no-data" : ""}">${esc(t3)}</td>
        </tr>
      `;
    }).join("");

    return `
      <tr class="trend-test-header"><td colspan="4">${esc(test.testName)}</td></tr>
      ${rows}
    `;
  }).join("");

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
          <tbody>${allRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Pathology table (reportItems-driven) ─────────────────────
function renderPathologyUsingReportItems(result) {
  const testName     = result?.test?.name || "Lab Test";
  const items        = Array.isArray(result?.reportItems) ? result.reportItems : [];
  const paramResults = Array.isArray(result?.parameterResults) ? result.parameterResults : [];
  const prMap        = buildParamResultMap(paramResults);

  const currentDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

  // ── Fallback: no reportItems — render raw parameterResults ──
  if (!items.length) {
    const fallbackRows = paramResults.map((pr) => {
      const pname      = pr?.parameter?.name ?? pr?.parameterName ?? "";
      const method     = pr?.parameter?.method ?? pr?.method ?? "";
      const value      = formatValue(pr);
      const unit       = formatUnit(pr);
      const refRaw     = pr?.normalRangeText ?? "";
      const refIsHtml  = refRaw && /<\/?[a-z][\s\S]*>/i.test(refRaw);
      const refContent = refIsHtml ? sanitizeHtml(refRaw) : esc(refRaw);
      const flag       = pr?.flag;
      const isHigh     = flag && (flag === "HIGH" || flag === "HH");
      const isLow      = flag && (flag === "LOW"  || flag === "LL");
      const valueClass = isHigh ? "abnormal-value high" : isLow ? "abnormal-value low" : "";

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
    }).join("");

    return `
      <div class="section pathology keep-together">
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
            ${fallbackRows || `<tr><td colspan="3" class="muted text-center">No parameters available</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Render using reportItems ───────────────────────────────
  const rows = items.map((it) => {
    const type = String(it?.type || "").toUpperCase();

    if (type === "HEADING") {
      const title = (it?.title || it?.text || "").trim();
      if (!title) return "";
      return `
        <tr class="row-heading">
          <td colspan="3" class="heading-cell">${esc(title)}</td>
        </tr>
      `;
    }

    if (type === "RICH_TEXT") {
      const html = sanitizeHtml(it?.html || it?.text || "");
      if (!html.trim()) return "";
      return `
        <tr class="row-richtext">
          <td colspan="3" class="richtext-cell ql-scope">${html}</td>
        </tr>
      `;
    }

    if (type === "NOTES") {
      const html = sanitizeHtml(it?.text || it?.html || "");
      if (!html.trim()) return "";
      return `
        <tr class="row-notes">
          <td colspan="3" class="notes-cell ql-scope">${html}</td>
        </tr>
      `;
    }

    if (type === "PARAMETER") {
      const pr         = it?.parameterId != null ? prMap.get(it.parameterId) : null;
      const pname      = it?.parameter?.name   || pr?.parameter?.name   || "";
      const method     = it?.parameter?.method || pr?.parameter?.method || "";
      const notes      = it?.parameter?.notes  || pr?.parameter?.notes  || "";
      const value      = pr ? formatValue(pr) : "";
      const unit       = pr ? formatUnit(pr)  : (it?.parameter?.unit || "");
      const refRaw     = formatRefFromPRorItem(pr, it?.parameter);
      const refIsHtml  = refRaw && /<\/?[a-z][\s\S]*>/i.test(refRaw);
      const refContent = refIsHtml ? sanitizeHtml(refRaw) : esc(refRaw);
      const flag       = pr?.flag;
      const isHigh     = flag && (flag === "HIGH" || flag === "HH");
      const isLow      = flag && (flag === "LOW"  || flag === "LL");
      const valueClass = isHigh ? "abnormal-value high" : isLow ? "abnormal-value low" : "";

      return `
        <tr>
          <td class="param-name-cell">
            <div class="param-name">${esc(pname)}</div>
            ${method ? `<div class="param-method">${esc(method)}</div>` : ""}
            ${notes  ? `<div class="param-notes">${sanitizeHtml(notes)}</div>` : ""}
          </td>
          <td class="${valueClass}">
            ${esc(value)}${unit ? " " + esc(unit) : ""}
          </td>
          <td class="ref-range ${refIsHtml ? "ref-html" : ""}">
            ${refContent || ""}${unit ? " " + esc(unit) : ""}
          </td>
        </tr>
      `;
    }

    return "";
  }).join("");

  const sectionClass =
    (result?.parameterResults?.length || 0) > 20
      ? "section pathology"
      : "section pathology keep-together";

  return `
    <div class="${sectionClass}">
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
          ${rows || `<tr><td colspan="3" class="muted text-center">No items available</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ══════════════════════════════════════════════════════════════
export function resultsTableHtml({ results, trendMap, returnMeta = false }) {
  const all       = Array.isArray(results) ? results : [];
  const radiology = all.filter(isRadiology);
  const pathology = all.filter(isPathology);

  const indexItems = [];
  let seq = 0;

  // ── 1) RADIOLOGY grouped by department ──────────────────────
  const radiologyGroups = groupByDepartment(radiology);

  const radiologyHtml = radiologyGroups.map((group) => {
    const testsHtml = group.results.map((r) => {
      seq += 1;
      const testName = r?.test?.name || "Radiology Report";
      const id       = `test-${seq}-${slugify(testName)}`;

      indexItems.push({
        id,
        title:      testName,
        dept:       group.deptName || "General",
        paramCount: 0,
        type:       "Radiology",
      });

      return `
        <div class="section radiology" id="${esc(id)}">
          <div class="section-title">${esc(testName)}</div>
          <div class="radio-html ql-scope">
            ${sanitizeHtml(r.reportHtml) || `<div class="muted">No content available</div>`}
          </div>
          ${renderNotesBlock(r?.notes)}
        </div>
      `;
    }).join("");

    // ✅ Signature once per department group
    const signaturesHtml = generateTestSignatures(group.results[0]);

    return `
      <div class="dept-group">
        ${renderDeptHeader(group.deptName)}
        ${testsHtml}
        ${signaturesHtml}
      </div>
    `;
  }).join("");

  // ── 2) PATHOLOGY grouped by department ──────────────────────
  const pathologyGroups = groupByDepartment(pathology);

  const pathologyHtml = pathologyGroups.map((group) => {
    const testsHtml = group.results.map((r) => {
      seq += 1;
      const testName   = r?.test?.name || "Lab Test";
      const id         = `test-${seq}-${slugify(testName)}`;
      const paramCount = Array.isArray(r?.parameterResults) ? r.parameterResults.length : 0;

      indexItems.push({
        id,
        title:      testName,
        dept:       group.deptName || "General",
        paramCount,
        type:       "Pathology",
      });

      return `
        <div id="${esc(id)}">
          ${renderPathologyUsingReportItems(r)}
          ${renderNotesBlock(r?.notes)}
        </div>
      `;
    }).join("");

    // ✅ Signature once per department group
    const signaturesHtml = generateTestSignatures(group.results[0]);

    return `
      <div class="dept-group">
        ${renderDeptHeader(group.deptName)}
        ${testsHtml}
        ${signaturesHtml}
      </div>
    `;
  }).join("");

  // ── 3) TRENDS ────────────────────────────────────────────────
  const allTrendsHtml = generateAllTrendsSection(pathology, trendMap);

  // ── No results at all ────────────────────────────────────────
  if (!radiologyHtml && !pathologyHtml) {
    const html = `
      <div class="section">
        <div class="section-title">Laboratory Results</div>
        <table class="tbl"><tbody>
          <tr><td class="muted text-center">No results available</td></tr>
        </tbody></table>
      </div>
    `;
    return returnMeta ? { html, indexItems: [] } : html;
  }

  const html = radiologyHtml + pathologyHtml + allTrendsHtml;

  return returnMeta ? { html, indexItems } : html;
}