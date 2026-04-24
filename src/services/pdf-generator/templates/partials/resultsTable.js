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

// ✅ FIX: Check if HTML has real visible content (not just empty Quill tags like <p><br></p>)
function hasVisibleHtmlContent(html) {
  if (!html) return false;
  const stripped = String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, "")
    .trim();
  return stripped.length > 0;
}

function formatValue(pr) {
  const vn = pr?.valueNumber;
  const vt = pr?.valueText;
  // Prefer valueText so user-entered formatting (e.g. "6.0") is preserved.
  // Fall back to valueNumber for legacy rows that only have the numeric value.
  const v =
    (vt !== null && vt !== undefined && vt !== "" ? vt : null) ??
    (vn !== null && vn !== undefined ? vn : null) ??
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
  const ranges = itemParam?.ranges || [];

  if (ranges.length) {
    const r0 = ranges[0];

    const hasLower = r0?.lowerLimit !== null && r0?.lowerLimit !== undefined;
    const hasUpper = r0?.upperLimit !== null && r0?.upperLimit !== undefined;

    if (hasLower || hasUpper) {
      const lower = hasLower ? String(r0.lowerLimit) : "";
      const upper = hasUpper ? String(r0.upperLimit) : "";
      const text = `${lower}${lower && upper ? " - " : ""}${upper}`.trim();
      if (text && text !== "-") return text;
    }

    if (r0?.normalValueHtml && String(r0.normalValueHtml).trim()) {
      return String(r0.normalValueHtml);
    }

    if (r0?.specialConditionHtml && String(r0.specialConditionHtml).trim()) {
      return String(r0.specialConditionHtml);
    }
  }

  return "";
}

function injectRefHtmlStyles(html) {
  if (!html) return "";
  return html
    .replace(
      /<table([^>]*)>/gi,
      `<table$1 style="border-collapse:collapse;font-size:11px;width:100%;margin:0;">`,
    )
    .replace(
      /<td([^>]*)>/gi,
      `<td$1 style="border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top;font-size:11px;font-style:normal;">`,
    )
    .replace(
      /<th([^>]*)>/gi,
      `<th$1 style="border:1px solid #cbd5e1;padding:4px 6px;background:#f1f5f9;font-size:11px;font-weight:600;">`,
    )
    .replace(
      /<p([^>]*)>/gi,
      `<p$1 style="margin:2px 0;font-size:11px;font-style:normal;">`,
    );
}

function renderNotesBlock(notes) {
  let notesText = notes || "";
  // Parse JSON notes format: { __notes: "...", __freeTexts: {...} }
  try {
    const parsed = JSON.parse(notesText);
    notesText = parsed.__notes || "";
  } catch {
    // plain string — use as-is
  }
  const notesHtml = sanitizeHtml(notesText);
  if (!notesHtml.trim()) return "";
  return `
    <div class="test-notes">
      <div class="test-notes-title">Notes</div>
      <div class="test-notes-body ql-scope">${notesHtml}</div>
    </div>
  `;
}

function isRadiology(r) {
  return (
    !!r?.reportHtml && (!r?.parameterResults || r.parameterResults.length === 0)
  );
}

function isPathology(r) {
  return (
    (Array.isArray(r?.parameterResults) && r.parameterResults.length > 0) ||
    (Array.isArray(r?.reportItems) && r.reportItems.length > 0)
  );
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

function buildParamResultMap(parameterResults = []) {
  const map = new Map();
  for (const pr of parameterResults || []) {
    if (pr?.parameterId != null) map.set(pr.parameterId, pr);
  }
  return map;
}

function generateTestSignatures(result) {
  const signatures = {
    left: result?.leftSignature || null,
    center: result?.centerSignature || null,
    right: result?.rightSignature || null,
  };
  if (!signatures.left && !signatures.center && !signatures.right) return "";

  const renderSig = (sig) => {
    if (!sig) return '<div class="sig-card sig-empty"></div>';
    return `
      <div class="sig-card">
        ${sig.signatureImg
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
      <div class="sig-col sig-left">${renderSig(signatures.left)}</div>
      <div class="sig-col sig-center">${renderSig(signatures.center)}</div>
      <div class="sig-col sig-right">${renderSig(signatures.right)}</div>
    </div>
  `;
}

function renderDeptHeader(deptName) {
  if (!deptName) return "";
  return `
    <div class="dept-header">
      <span class="dept-header-title">${esc(deptName)}</span>
    </div>
  `;
}

function groupByDepartment(arr) {
  const groups = [];
  const map = new Map();
  for (const r of arr) {
    const key = r?.test?.departmentItemId ?? "none";
    if (!map.has(key)) {
      const g = {
        key,
        deptName: r?.test?.departmentItem?.name || null,
        results: [],
      };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key).results.push(r);
  }
  return groups;
}

function generateAllTrendsSection(pathologyResults, trendMap) {
  if (!trendMap || pathologyResults.length === 0) return "";

  const testsWithTrends = [];
  pathologyResults.forEach((result) => {
    const testId = result?.testId ?? result?.test?.id;
    const testName = result?.test?.name || "Lab Test";
    const paramResults = result.parameterResults || [];
    const hasTrends = paramResults.some((pr) => {
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
      const trends =
        trendMap.get(
          `${testsWithTrends[0].testId}:${firstParam.parameterId}`,
        ) || [];
      trendDates = trends.map((t) => formatDate(t.date));
    }
  }

  const allRows = testsWithTrends
    .map((test) => {
      const rows = test.paramResults
        .map((pr) => {
          const pname = pr?.parameter?.name ?? pr?.parameterName ?? "";
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
        })
        .join("");

      return `
      <tr class="trend-test-header"><td colspan="4">${esc(test.testName)}</td></tr>
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
          <tbody>${allRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function buildResultCell(value, unit, valueClass, bold = false) {
  const hasValue =
    value !== null && value !== undefined && String(value).trim() !== "";
  if (!hasValue) {
    return `<td class="${valueClass}">—</td>`;
  }
  let content = `${esc(value)}${unit ? " " + esc(unit) : ""}`;
  if (bold) content = `<b>${content}</b>`;
  return `<td class="${valueClass}">${content}</td>`;
}

function buildRefCell(refRaw, unit) {
  if (!refRaw || !String(refRaw).trim()) {
    return `<td class="ref-range"></td>`;
  }

  const refIsHtml = /<\/?[a-z][\s\S]*>/i.test(refRaw);

  if (refIsHtml) {
    const styledHtml = injectRefHtmlStyles(sanitizeHtml(refRaw));
    return `<td class="ref-range ref-html">${styledHtml}</td>`;
  }

  const unitSuffix = unit ? ` <span class="ref-unit">${esc(unit)}</span>` : "";
  return `<td class="ref-range">${esc(refRaw)}${unitSuffix}</td>`;
}

// ── Parse notes JSON to extract __freeTexts map ──────────────
function parseFreeTextsFromNotes(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed.__freeTexts || {};
  } catch {
    return {};
  }
}

// ── Pathology table (reportItems-driven) ─────────────────────
function renderPathologyUsingReportItems(result) {
  const testName = result?.test?.name || "Lab Test";
  const items = Array.isArray(result?.reportItems) ? result.reportItems : [];
  const paramResults = Array.isArray(result?.parameterResults)
    ? result.parameterResults
    : [];
  const prMap = buildParamResultMap(paramResults);
  const freeTextsMap = parseFreeTextsFromNotes(result?.notes);

  const currentDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  // ── Fallback: no reportItems — render raw parameterResults ──
  if (!items.length) {
    const fallbackRows = paramResults
      .map((pr) => {
        const pname = pr?.parameter?.name ?? pr?.parameterName ?? "";
        const method = pr?.parameter?.method ?? pr?.method ?? "";
        const value = formatValue(pr);
        const unit = formatUnit(pr);
        const flag = pr?.flag;
        const isHigh = flag && (flag === "HIGH" || flag === "HH");
        const isLow = flag && (flag === "LOW" || flag === "LL");
        const valueClass = isHigh
          ? "abnormal-value high"
          : isLow
            ? "abnormal-value low"
            : "";

        const refRaw = formatRefFromPRorItem(pr, pr?.parameter);

        // ✅ Check if this option value is marked as bold
        const optBold = (pr?.parameter?.resultOpts || []).find(
          (o) => o.value === value || o.label === value
        );
        const isBold = optBold ? optBold.isBold !== false : false;

        // ✅ Skip rows with no value
        if (!value && value !== 0) return "";

        const rowClass = (isHigh || isLow) ? ' class="row-abnormal"' : '';
        return `
        <tr${rowClass}>
          <td class="param-name-cell">
            <div class="param-name">${esc(pname)}</div>
            ${method ? `<div class="param-method">${esc(method)}</div>` : ""}
          </td>
          ${buildResultCell(value, unit, valueClass, isBold)}
          ${buildRefCell(refRaw, unit)}
        </tr>
      `;
      })
      .join("");

    // ✅ FIX: Skip entire section if no rows were produced (all values empty/calculating)
    if (!fallbackRows.trim()) return "";

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
            ${fallbackRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Render using reportItems ───────────────────────────────
  const rows = items
    .map((it) => {
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
        // Value is filled at result time (stored in freeTextsMap by item id),
        // falling back to any design-time default
        const itemId = String(it?.id || "");
        const rawHtml = freeTextsMap[itemId] || it?.html || it?.text || "";
        const html = sanitizeHtml(rawHtml);
        const title = (it?.title || "").trim();
        if (!html.trim() && !title) return "";
        if (title) {
          return `
        <tr class="row-richtext">
          <td class="param-name-cell"><div class="param-name">${esc(title)}</div></td>
          <td colspan="2" class="richtext-cell ql-scope">${html}</td>
        </tr>
      `;
        }
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

      if (type === "FREE_TEXT") {
        const itemId = String(it?.id || "");
        const rawHtml = freeTextsMap[itemId] || it?.html || it?.text || "";
        const html = sanitizeHtml(rawHtml);
        if (!hasVisibleHtmlContent(html)) return "";
        const title = (it?.title || "").trim();
        return `
        ${title ? `<tr class="row-heading"><td colspan="3" class="heading-cell">${esc(title)}</td></tr>` : ""}
        <tr class="row-richtext">
          <td colspan="3" class="richtext-cell ql-scope">${html}</td>
        </tr>
      `;
      }

      if (type === "PARAMETER") {
        const pr = it?.parameterId != null ? prMap.get(it.parameterId) : null;

        // ✅ Skip if no result was saved for this parameter
        if (!pr) return "";

        const value = formatValue(pr);
        if (value === "" || value === null || value === undefined) return "";

        const pname = it?.parameter?.name || pr?.parameter?.name || "";
        const method = it?.parameter?.method || pr?.parameter?.method || "";
        const notes = it?.parameter?.notes || pr?.parameter?.notes || "";
        const unit = pr ? formatUnit(pr) : it?.parameter?.unit || "";
        const flag = pr?.flag;
        const isHigh = flag && (flag === "HIGH" || flag === "HH");
        const isLow = flag && (flag === "LOW" || flag === "LL");
        const valueClass = isHigh
          ? "abnormal-value high"
          : isLow
            ? "abnormal-value low"
            : "";

        const refRaw = formatRefFromPRorItem(pr, it?.parameter);

        // ✅ Check if this option value is marked as bold
        const optBold = (it?.parameter?.resultOpts || []).find(
          (o) => o.value === value || o.label === value
        );
        const isBold = optBold ? optBold.isBold !== false : false;

        const rowClass = (isHigh || isLow) ? ' class="row-abnormal"' : '';
        return `
        <tr${rowClass}>
          <td class="param-name-cell">
            <div class="param-name">${esc(pname)}</div>
            ${method ? `<div class="param-method">${esc(method)}</div>` : ""}
            ${notes ? `<div class="param-notes">${sanitizeHtml(notes)}</div>` : ""}
          </td>
          ${buildResultCell(value, unit, valueClass, isBold)}
          ${buildRefCell(refRaw, unit)}
        </tr>
      `;
      }

      return "";
    })
    .join("");

  // ✅ FIX: Check if any PARAMETER rows have real values
  const hasParameterRows = items.some((it) => {
    if (String(it?.type || "").toUpperCase() !== "PARAMETER") return false;
    const pr = it?.parameterId != null ? prMap.get(it.parameterId) : null;
    if (!pr) return false;
    const value = formatValue(pr);
    return value !== "" && value !== null && value !== undefined;
  });

  // ✅ FIX: Skip section entirely if no parameter values AND no rendered rows
  if (!hasParameterRows && !rows.trim()) return "";

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
export function resultsTableHtml({
  results,
  trendMap,
  returnMeta = false,
  showTrends = true,
}) {
  const all = Array.isArray(results) ? results : [];
  const radiology = all.filter(isRadiology);
  const pathology = all.filter(isPathology);

  const indexItems = [];
  let seq = 0;

  // ── 1) RADIOLOGY grouped by department ──────────────────────
  const radiologyGroups = groupByDepartment(radiology);

  const radiologyHtml = radiologyGroups
    .map((group) => {
      const testsHtml = group.results
        .map((r) => {
          seq += 1;
          const testName = r?.test?.name || "Radiology Report";
          const id = `test-${seq}-${slugify(testName)}`;

          // ✅ FIX: Skip radiology section if reportHtml has no visible content
          // (e.g. Quill empty state "<p><br></p>" is truthy but renders blank)
          const sanitizedHtml = sanitizeHtml(r.reportHtml);
          if (!hasVisibleHtmlContent(sanitizedHtml) && !r?.notes) return "";

          indexItems.push({
            id,
            title: testName,
            dept: group.deptName || "General",
            paramCount: 0,
            type: "Radiology",
          });

          return `
        <div class="section radiology" id="${esc(id)}">
          <div class="section-title">${esc(testName)}</div>
          <div class="radio-html ql-scope">
            ${sanitizedHtml || `<div class="muted">No content available</div>`}
          </div>
          ${renderNotesBlock(r?.notes)}
        </div>
      `;
        })
        .join("");

      // ✅ FIX: Skip entire radiology dept group if all tests were empty
      if (!testsHtml.trim()) return "";

      const signaturesHtml = generateTestSignatures(group.results[0]);

      return `
      <div class="dept-group dept-group-radiology">
        ${renderDeptHeader(group.deptName)}
        ${testsHtml}
        ${signaturesHtml}
      </div>
    `;
    })
    .join("");

  // ── 2) PATHOLOGY grouped by department ──────────────────────
  const pathologyGroups = groupByDepartment(pathology);

  const pathologyHtml = pathologyGroups
    .map((group) => {
      const testsHtml = group.results
        .map((r) => {
          seq += 1;
          const testName = r?.test?.name || "Lab Test";
          const id = `test-${seq}-${slugify(testName)}`;
          const paramCount = Array.isArray(r?.parameterResults)
            ? r.parameterResults.length
            : 0;

          // ✅ FIX: Build section HTML first — skip entirely if empty
          const sectionHtml = renderPathologyUsingReportItems(r);
          if (!sectionHtml.trim()) return "";

          indexItems.push({
            id,
            title: testName,
            dept: group.deptName || "General",
            paramCount,
            type: "Pathology",
          });

          return `
        <div id="${esc(id)}">
          ${sectionHtml}
          ${renderNotesBlock(r?.notes)}
        </div>
      `;
        })
        .join("");

      // ✅ FIX: Skip entire pathology dept group if all tests were empty
      // This prevents the dept header ("HORMONE ASSAYS") from rendering alone
      if (!testsHtml.trim()) return "";

      const signaturesHtml = generateTestSignatures(group.results[0]);

      return `
      <div class="dept-group">
        
        ${testsHtml}
        ${signaturesHtml}
      </div>
    `;
    })
    .join("");

  // ── 3) TRENDS — only when showTrends is true ─────────────────
  const allTrendsHtml = showTrends
    ? generateAllTrendsSection(pathology, trendMap)
    : "";

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