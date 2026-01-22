// generatePatient3Pdfs.js
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

/* -----------------------------
✅ Helper: render HTML -> PDF
----------------------------- */
async function renderPdfFromHtml(browser, html, pdfOptions = {}) {
  const page = await browser.newPage();
  
  // Set better viewport for A4
  await page.setViewport({ 
    width: 1240, 
    height: 1754, 
    deviceScaleFactor: 2 
  });
  
  await page.setContent(html, { 
    waitUntil: ["networkidle0", "domcontentloaded"] 
  });
  
  // Wait for fonts to load
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0.5cm", right: "0.5cm", bottom: "0.5cm", left: "0.5cm" },
    scale: 1,
    ...pdfOptions, // ✅ DO NOT pass pageRanges here for main content
  });

  await page.close();
  return pdf;
}

async function renderSinglePagePdfFromHtml(browser, html) {
  return renderPdfFromHtml(browser, html, { pageRanges: "1" }); // ✅ only here
}

/* -----------------------------
✅ Utils
----------------------------- */
function calculateAge(dob) {
  if (!dob) return "N/A";
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function safeTrim(v) {
  if (v == null) return "";
  return String(v).trim();
}

function isHtmlPresent(v) {
  return safeTrim(v) !== "";
}

function formatShortDate(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "";
  }
}

function getFlagKind(flag) {
  const f = safeTrim(flag).toLowerCase();
  if (!f || f === "normal") return "normal";
  if (f.includes("high")) return "high";
  if (f.includes("low")) return "low";
  if (f.includes("critical")) {
    if (f.includes("high")) return "high";
    if (f.includes("low")) return "low";
    return "high";
  }
  return "normal";
}

function renderResultWithArrow(valueText, flag) {
  const kind = getFlagKind(flag);
  const arrowClass = kind === "high" ? "red" : 
                    kind === "low" ? "green" : "";
  
  if (kind === "high") 
    return `${escapeHtml(valueText)} <span class="arrow ${arrowClass}">↑</span>`;
  if (kind === "low") 
    return `${escapeHtml(valueText)} <span class="arrow ${arrowClass}">↓</span>`;
  
  return `${escapeHtml(valueText)}`;
}

function formatValueWithUnit(value, unit) {
  const v = value == null || String(value).trim() === "" ? "—" : String(value);
  const u = safeTrim(unit);
  if (!u || v === "—") return v;
  return `${v} ${u}`;
}

function formatRangeWithUnit(rangeText, unit) {
  const rt = safeTrim(rangeText);
  const u = safeTrim(unit);
  if (!rt) return "—";
  if (!u) return rt;
  if (rt.toLowerCase().includes(u.toLowerCase())) return rt;
  return `${rt} ${u}`;
}

function getReferenceRangeText(pr) {
  const direct =
    pr.normalRangeText ??
    pr.referenceText ??
    pr.referenceRange ??
    pr.referenceRangeText ??
    pr.rangeText ??
    pr.parameter?.normalRangeText ??
    pr.parameter?.referenceText ??
    pr.parameter?.referenceRange ??
    pr.parameter?.referenceRangeText ??
    pr.parameter?.rangeText ??
    "";

  if (safeTrim(direct)) return safeTrim(direct);

  const rr =
    pr.parameter?.ranges?.[0]?.referenceRange ??
    pr.parameter?.ranges?.[0]?.normalRangeText ??
    pr.parameter?.ranges?.[0]?.referenceText ??
    "";

  if (safeTrim(rr)) return safeTrim(rr);

  const lower =
    pr.lowerLimit ?? pr.parameter?.ranges?.[0]?.lowerLimit ?? pr.parameter?.lowerLimit ?? null;
  const upper =
    pr.upperLimit ?? pr.parameter?.ranges?.[0]?.upperLimit ?? pr.parameter?.upperLimit ?? null;

  const hasLower = lower !== null && lower !== undefined && String(lower) !== "";
  const hasUpper = upper !== null && upper !== undefined && String(upper) !== "";

  if (hasLower || hasUpper) {
    return `${hasLower ? lower : ""}${hasLower || hasUpper ? " - " : ""}${hasUpper ? upper : ""}`.trim();
  }

  return "";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRefDoctorDisplay(order) {
  const d = order?.doctor;
  if (!d) return "N/A";
  if (typeof d === "string") return safeTrim(d) || "N/A";
  return (
    safeTrim(d.name || d.fullName || d.doctorName || d.displayName || d.title || "") || "N/A"
  );
}

/* -------------------------------------------------------
✅ Radiology splitter
-------------------------------------------------------- */
function splitRadiologyHtmlIntoPages(reportHtml, maxChars = 3200, minChars = 1400) {
  const html = safeTrim(reportHtml);
  if (!html) return [""];

  let normalized = html
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "<br/>\n")
    .replace(/<\/p>/gi, "</p>\n")
    .replace(/<\/div>/gi, "</div>\n")
    .replace(/<\/li>/gi, "</li>\n")
    .replace(/<\/tr>/gi, "</tr>\n")
    .replace(/<strong>/gi, "\n<strong>")
    .replace(/<b>/gi, "\n<b>");

  const lines = normalized
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const pages = [];
  let buf = "";

  for (const line of lines) {
    if (line.length > maxChars) {
      if (buf) pages.push(buf);
      pages.push(line);
      buf = "";
      continue;
    }

    if ((buf + "\n" + line).length > maxChars) {
      if (buf) pages.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) pages.push(buf);

  const merged = [];
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i];
    const next = pages[i + 1];

    if (cur && cur.length < minChars && next) {
      pages[i + 1] = cur + "\n" + next;
    } else if (cur) {
      merged.push(cur);
    }
  }

  if (merged.length >= 2) {
    const last = merged[merged.length - 1];
    if (last.length < minChars) {
      merged[merged.length - 2] = merged[merged.length - 2] + "\n" + last;
      merged.pop();
    }
  }

  return merged.length ? merged : [html];
}

/* -------------------------------------------------------
✅ Image optimization
-------------------------------------------------------- */
const _imgCache = new Map();

async function getFetch() {
  if (typeof fetch !== "undefined") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

async function optimizeImageToDataUrl(url, opts) {
  const u = safeTrim(url);
  if (!u) return null;

  const key = `${u}::${JSON.stringify(opts || {})}`;
  if (_imgCache.has(key)) return _imgCache.get(key);

  try {
    const _fetch = await getFetch();
    const res = await _fetch(u);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);

    const ab = await res.arrayBuffer();
    const inputBuf = Buffer.from(ab);

    let sharpMod = null;
    try {
      sharpMod = await import("sharp");
    } catch {
      sharpMod = null;
    }

    if (!sharpMod?.default) {
      _imgCache.set(key, u);
      return u;
    }

    const sharp = sharpMod.default;
    const { width = null, height = null, fit = "cover", quality = 60 } = opts || {};

    let pipeline = sharp(inputBuf);
    if (width || height) {
      pipeline = pipeline.resize({
        width: width || null,
        height: height || null,
        fit,
        withoutEnlargement: true,
      });
    }

    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${out.toString("base64")}`;
    _imgCache.set(key, dataUrl);
    return dataUrl;
  } catch {
    _imgCache.set(key, u);
    return u;
  }
}

/* -------------------------------------------------------
✅ PDF post-compress using Ghostscript
-------------------------------------------------------- */
async function compressPdfBuffer(inputBuffer, preset = "/ebook") {
  try {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-"));
    const inPath = path.join(tmpDir, "in.pdf");
    const outPath = path.join(tmpDir, "out.pdf");
    await fs.writeFile(inPath, inputBuffer);

    await execFileAsync("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${preset}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-sColorImageDownsampleType=/Bicubic",
      "-dColorImageResolution=150",
      "-sOutputFile=" + outPath,
      inPath,
    ]);

    const out = await fs.readFile(outPath);
    await fs.rm(tmpDir, { recursive: true, force: true });
    return out;
  } catch {
    return inputBuffer;
  }
}

/* -------------------------------------------------------
Trend map
-------------------------------------------------------- */
async function buildTrendMap({ results, patientId }) {
  const trendMap = new Map();

  for (const r of results) {
    if (isHtmlPresent(r.reportHtml)) continue;

    const testId = r.testId ?? r.test?.id;
    if (!testId) continue;

    const previous = await prisma.patientTestResult.findMany({
      where: {
        patientId: Number(patientId),
        testId: Number(testId),
        ...(r.createdAt ? { createdAt: { lt: r.createdAt } } : { id: { lt: r.id } }),
      },
      orderBy: r.createdAt ? { createdAt: "desc" } : { id: "desc" },
      take: 3,
      include: {
        parameterResults: {
          include: { parameter: true },
          orderBy: { parameterId: "asc" },
        },
      },
    });

    const prevByIndex = previous.map((prev) => {
      const perParam = new Map();
      for (const pr of prev.parameterResults || []) {
        const value = pr.valueNumber ?? pr.valueText ?? "—";
        const unit = pr.unit || pr.parameter?.unit || "";
        perParam.set(pr.parameterId, formatValueWithUnit(value, unit));
      }
      return { date: prev.createdAt || prev.updatedAt || null, perParam };
    });

    for (const pr of r.parameterResults || []) {
      const arr = prevByIndex.map((x) => ({
        date: x.date,
        value: x.perParam.get(pr.parameterId) ?? "",
      }));
      trendMap.set(`${testId}:${pr.parameterId}`, arr);
    }
  }

  return trendMap;
}

function hasAnyTrendsForTest(trendMap, testId, parameterResults) {
  if (!trendMap || !parameterResults || parameterResults.length === 0) return false;

  for (const pr of parameterResults) {
    const arr = trendMap.get(`${testId}:${pr.parameterId}`) || [];
    if (arr.some((item) => safeTrim(item.value) && safeTrim(item.value) !== "—")) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------
✅ Signatures
-------------------------------------------------------- */
function renderSigCell(sig, pos /* "left"|"center"|"right" */) {
  const name = sig ? safeTrim(sig.name) : "";
  const desig = sig ? safeTrim(sig.designation) || safeTrim(sig.qualification) : "";
  const img = sig?.signatureImg ? `<img class="sig-img" src="${sig.signatureImg}" alt="signature" />` : "";

  return `
    <div class="sig-cell ${pos}">
      <div class="sig-img-wrap">${img}</div>
      <div class="sig-name">${escapeHtml(name || " ")}</div>
      <div class="sig-desig">${escapeHtml(desig || " ")}</div>
    </div>
  `;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < (arr?.length || 0); i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* -------------------------------------------------------
✅ Default signatures by Category
-------------------------------------------------------- */
async function getDefaultSignaturesByCategory(categoryIds = []) {
  const ids = [...new Set(categoryIds.map(Number))].filter(Boolean);
  if (!ids.length) return new Map();

  const rows = await prisma.eSignatureCategory.findMany({
    where: { categoryId: { in: ids }, isDefault: true },
    include: {
      signature: {
        select: {
          id: true,
          name: true,
          designation: true,
          qualification: true,
          signatureImg: true,
          alignment: true,
        },
      },
    },
  });

  const map = new Map();
  for (const row of rows) {
    const cid = row.categoryId;
    if (!map.has(cid)) map.set(cid, { LEFT: null, CENTER: null, RIGHT: null });

    const sig = row.signature;
    if (!sig) continue;

    const bucket = map.get(cid);
    const a = String(sig.alignment || "").toUpperCase();

    if (a === "LEFT" && !bucket.LEFT) bucket.LEFT = sig;
    else if (a === "CENTER" && !bucket.CENTER) bucket.CENTER = sig;
    else if (a === "RIGHT" && !bucket.RIGHT) bucket.RIGHT = sig;
  }

  return map;
}

/* -------------------------------------------------------
✅ CSS
✅ IMPROVED: Better fonts, spacing, and visual design
-------------------------------------------------------- */
function buildCss({ headerH = 120, footerH = 70, sigH = 90, fontPx = 11.5 } = {}) {
  return `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    @page { 
      size: A4; 
      margin: 0; 
    }
    
    html, body { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: ${fontPx}px;
      color: #1a1a1a;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    :root {
      --header-h: ${headerH}px;
      --footer-h: ${footerH}px;
      --sig-h: ${sigH}px;
      --primary-color: #1a56db;
      --secondary-color: #6b7280;
      --border-color: #e5e7eb;
      --light-bg: #f9fafb;
      --danger-color: #dc2626;
      --success-color: #059669;
    }

    .header, .footer {
      position: fixed;
      left: 0;
      right: 0;
      z-index: 10;
      background: white;
    }
    .header { 
      top: 0; 
      height: var(--header-h);
      border-bottom: 1px solid var(--border-color);
    }
    .footer { 
      bottom: 0; 
      height: var(--footer-h);
      border-top: 1px solid var(--border-color);
    }

    .header img, .footer img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    .header.blank, .footer.blank { 
      background: transparent;
      border: none;
    }

    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      box-sizing: border-box;
      padding-top: calc(var(--header-h) + 15px);
      padding-left: 20px;
      padding-right: 20px;
      padding-bottom: calc(var(--footer-h) + var(--sig-h) + 15px);
      page-break-after: always;
      break-after: page;
      background: white;
    }

    .title {
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      margin: 0 0 10px 0;
      color: var(--primary-color);
      letter-spacing: -0.5px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--primary-color);
    }

    .patient-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      padding: 12px 15px;
      background: var(--light-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 11.5px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .patient-strip .col {
      min-width: 0;
    }
    
    .patient-strip .row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      align-items: center;
    }
    
    .patient-strip b {
      font-weight: 600;
      color: var(--secondary-color);
      min-width: 80px;
    }
    
    .patient-strip .value {
      font-weight: 500;
      color: #1a1a1a;
      text-align: right;
      flex: 1;
    }

    .test-name {
      margin: 15px 0 12px;
      font-size: 16px;
      font-weight: 700;
      color: var(--primary-color);
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-color);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    th {
      background: var(--light-bg);
      padding: 10px 8px;
      font-weight: 600;
      text-align: left;
      color: var(--primary-color);
      border-bottom: 2px solid var(--border-color);
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 9px 8px;
      border-bottom: 1px solid var(--border-color);
      font-size: 11.5px;
      vertical-align: middle;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover td {
      background: #f8fafc;
    }

    .parameter-name {
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 2px;
    }
    
    .method {
      color: var(--secondary-color);
      font-size: 10.5px;
      font-weight: 400;
      margin-top: 2px;
    }

    .result-cell {
      font-weight: 500;
      position: relative;
    }
    
    .range-cell {
      color: var(--secondary-color);
      font-size: 11px;
    }

    .arrow {
      font-weight: 800;
      margin-left: 6px;
      font-size: 13px;
      vertical-align: middle;
      display: inline-block;
      line-height: 1;
    }
    
    .arrow.red {
      color: var(--danger-color);
    }
    
    .arrow.green {
      color: var(--success-color);
    }

    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-left: 8px;
    }
    
    .status-normal {
      background: #d1fae5;
      color: #065f46;
    }
    
    .status-high {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .status-low {
      background: #dbeafe;
      color: #1e40af;
    }

    .sig-row {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: calc(var(--footer-h) + 10px);
      height: var(--sig-h);
      display: flex;
      gap: 20px;
      align-items: flex-end;
      padding-top: 15px;
      border-top: 1px solid var(--border-color);
    }
    
    .sig-cell {
      flex: 1;
      min-width: 0;
      font-size: 11px;
    }
    
    .sig-cell.center { 
      text-align: center; 
    }
    
    .sig-cell.right { 
      text-align: right; 
    }

    .sig-img {
      max-height: 45px;
      max-width: 140px;
      object-fit: cover;
      display: inline-block;
      margin-bottom: 8px;
      filter: brightness(0.9);
    }
    
    .sig-name {
      font-weight: 700;
      color: var(--primary-color);
      margin-top: 5px;
      font-size: 11.5px;
    }
    
    .sig-desig {
      color: var(--secondary-color);
      margin-top: 2px;
      font-size: 10.5px;
    }

    .page-number {
      position: fixed;
      right: 20px;
      bottom: 10px;
      z-index: 11;
      font-size: 10.5px;
      color: var(--secondary-color);
      font-weight: 400;
    }
    
    .page-number:before {
      content: "Page " counter(page) " / " counter(pages);
    }

    /* 70/30 Layout Improvements */
    .two-col {
      display: grid;
      grid-template-columns: 70% 30%;
      gap: 20px;
      align-items: start;
    }

    .col-trend {
      padding: 15px;
      background: var(--light-bg);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .trend-title-right {
      font-weight: 700;
      margin: 0 0 12px;
      color: var(--primary-color);
      font-size: 13px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .trend-box table {
      font-size: 11px;
      background: white;
    }
    
    .trend-box th {
      background: #f1f5f9;
      font-size: 10.5px;

    }
    
    .trend-box td {
      padding: 7px 6px;
      font-size: 10.5px;
    }

    /* Radiology content styling */
    .radiology-wrap {
      margin-top: 15px;
      font-size: 12px;
      line-height: 1.6;
      color: #1a1a1a;
    }
    
    .radiology-wrap h1,
    .radiology-wrap h2,
    .radiology-wrap h3,
    .radiology-wrap h4 {
      color: var(--primary-color);
      margin-top: 15px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .radiology-wrap p {
      margin: 8px 0;
      text-align: justify;
    }
    
    .radiology-wrap strong,
    .radiology-wrap b {
      font-weight: 600;
      color: #1a1a1a;
    }
    
    .radiology-wrap ul,
    .radiology-wrap ol {
      margin: 8px 0 8px 20px;
    }

    /* Print optimizations */
    @media print {
      body {
        font-size: 11px;
      }
      
      .patient-strip {
        box-shadow: none;
        border: 1px solid #ccc;
      }
      
      table {
        border: 1px solid #ddd;
        box-shadow: none;
      }
      
      tr:hover td {
        background: transparent;
      }
      
      .two-col, 
      .col-main, 
      .col-trend { 
        page-break-inside: avoid;
      }
    }
  </style>
  `;
}

/* -----------------------------
✅ Build content HTML
✅ FIX: Trends now side-by-side (70/30) on FIRST chunk only
----------------------------- */
function buildPatientContentHtml({
  order,
  patient,
  results,
  mode = "standard", // "standard" | "full"
  trendMap = null,
  headerImg = null,
  footerImg = null,
  reserveHeaderFooterSpace = true,
}) {
  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  const isFull = mode === "full";
  const refDoctor = getRefDoctorDisplay(order);

  const ROWS_PER_PAGE_FULL = 14;
  const ROWS_PER_PAGE_STD = 24;

  const pages = [];

  for (const r of results) {
    const testId = r.testId ?? r.test?.id;
    const testName = safeTrim(r.test?.name) || "Test";

    if (isHtmlPresent(r.reportHtml)) {
      const parts = splitRadiologyHtmlIntoPages(r.reportHtml, 1800);
      parts.forEach((part, idx) => {
        pages.push({
          r,
          isRadiology: true,
          reportChunk: part,
          chunkIndex: idx,
          chunkCount: parts.length,
          testName,
          testId,
        });
      });
      continue;
    }

    const prs = r.parameterResults || [];
    const perPage = isFull ? ROWS_PER_PAGE_FULL : ROWS_PER_PAGE_STD;
    const chunks = chunkArray(prs, perPage);
    const chunkCount = chunks.length || 1;

    if (!chunks.length) {
      pages.push({
        r,
        isRadiology: false,
        chunk: [],
        chunkIndex: 0,
        chunkCount: 1,
        testName,
        testId,
      });
      continue;
    }

    chunks.forEach((chunk, idx) => {
      pages.push({
        r,
        isRadiology: false,
        chunk,
        chunkIndex: idx,
        chunkCount,
        testName,
        testId,
      });
    });
  }

  const css = buildCss({
    headerH: reserveHeaderFooterSpace ? 120 : headerImg ? 120 : 0,
    footerH: reserveHeaderFooterSpace ? 75 : footerImg ? 75 : 0,
    sigH: 95,
    fontPx: 11.5,
  });

  const headerClass = headerImg ? "header" : "header blank";
  const footerClass = footerImg ? "footer" : "footer blank";

  const patientStrip = () => `
  <div class="patient-strip">
    <div class="col">
      <div class="row">
        <b>Name:</b>
        <span class="value">${escapeHtml(patient.fullName || "N/A")}</span>
      </div>
      <div class="row">
        <b>Age/Gender:</b>
        <span class="value">${escapeHtml(String(calculateAge(patient.dob)))} / ${escapeHtml(patient.gender || "N/A")}</span>
      </div>
    </div>
    <div class="col">
      <div class="row">
        <b>Order ID:</b>
        <span class="value">${escapeHtml(order.orderNumber || order.id)}</span>
      </div>
      <div class="row">
        <b>Date:</b>
        <span class="value">${escapeHtml(reportDate)}</span>
      </div>
    </div>
    <div class="col">
      <div class="row">
        <b>Ref Dr:</b>
        <span class="value">${escapeHtml(refDoctor)}</span>
      </div>
      <div class="row">
        <b>Patient ID:</b>
        <span class="value">${escapeHtml(String(patient.id))}</span>
      </div>
    </div>
  </div>
`;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="page-number" content="counter(page) of counter(pages)">
      ${css}
    </head>
    <body>
      <div class="${headerClass}">
        ${headerImg ? `<img src="${headerImg}" alt="header" />` : ``}
      </div>

      <div class="${footerClass}">
        ${footerImg ? `<img src="${footerImg}" alt="footer" />` : ``}
      </div>

      <div class="page-number"></div>

      ${pages
        .map(({ r, isRadiology, reportChunk, chunk, chunkIndex, chunkCount, testName, testId }) => {
          const testTitle =
            chunkCount > 1
              ? `${escapeHtml(testName)} (Part ${chunkIndex + 1}/${chunkCount})`
              : `${escapeHtml(testName)}`;

          const sigRow = `
            <div class="sig-row">
              ${renderSigCell(r.sigLeft, "left")}
              ${renderSigCell(r.sigCenter, "center")}
              ${renderSigCell(r.sigRight, "right")}
            </div>
          `;

          if (isRadiology) {
            return `
              <div class="page">
                <div class="title">Medical Diagnostic Report</div>
                ${patientStrip()}
                <div class="test-name">${testTitle}</div>
                <div class="radiology-wrap">
                  ${reportChunk || ""}
                </div>
                ${sigRow}
              </div>
            `;
          }

          const prsForThisPage = chunk || [];

          const buildMainRows = (arr) =>
            arr
              .map((pr) => {
                const valueRaw = pr.valueNumber ?? pr.valueText ?? "—";
                const unit = pr.unit || pr.parameter?.unit || "";
                const method = pr.method || pr.parameter?.method || "";
                const flag = getFlagKind(pr.flag);
                
                const valueCell = formatValueWithUnit(valueRaw, unit);
                const rangeText = getReferenceRangeText(pr);
                const rangeCell = formatRangeWithUnit(rangeText, unit);
                
                // Determine status class
                const statusClass = flag === "high" ? "status-high" : 
                                  flag === "low" ? "status-low" : 
                                  "status-normal";
                
                // Add status badge if not normal
                const statusBadge = flag !== "normal" ? 
                  `<span class="status-badge ${statusClass}">${flag}</span>` : "";
                
                return `
                  <tr>
                    <td style="width:42%">
                      <div class="parameter-name">
                        ${escapeHtml(pr.parameter?.name || "—")}
                      
                      </div>
                      <div class="method">${escapeHtml(method || "-")}</div>
                    </td>
                    <td style="width:23%" class="result-cell">
                      ${renderResultWithArrow(valueCell, pr.flag)}
                    </td>
                    <td style="width:35%" class="range-cell">
                      ${escapeHtml(rangeCell || "—")}
                    </td>
                  </tr>
                `;
              })
              .join("");

          const mainTableHtml = `
            <table>
              <thead>
                <tr>
                  <th>Parameter / Method</th>
                  <th>Result</th>
                  <th>Bio Ref. Interval</th>
                </tr>
              </thead>
              <tbody>${buildMainRows(prsForThisPage)}</tbody>
            </table>
          `;

          // ✅ FULL mode: show trends only on first chunk and make it 70/30 beside main table
          if (isFull) {
            const hasTrends = trendMap
              ? hasAnyTrendsForTest(trendMap, testId, r.parameterResults)
              : false;

            const trendsHtml =
              hasTrends && chunkIndex === 0
                ? (() => {
                    let trendDates = ["Date 1", "Date 2", "Date 3"];
                    const firstParamId = r.parameterResults?.[0]?.parameterId;
                    if (firstParamId) {
                      const arr = trendMap.get(`${testId}:${firstParamId}`) || [];
                      trendDates = [
                        formatShortDate(arr[0]?.date) || "Date 1",
                        formatShortDate(arr[1]?.date) || "Date 2",
                        formatShortDate(arr[2]?.date) || "Date 3",
                      ];
                    }

                    const tRows = (r.parameterResults || [])
                      .map((pr) => {
                        const tArr = trendMap.get(`${testId}:${pr.parameterId}`) || [];
                        const t1 = safeTrim(tArr[0]?.value) || "—";
                        const t2 = safeTrim(tArr[1]?.value) || "—";
               
                        return `
                          <tr>
                            <td style="width:40%"><b>${escapeHtml(pr.parameter?.name || "—")}</b></td>
                            <td style="width:20%">${escapeHtml(t1)}</td>
                            <td style="width:20%">${escapeHtml(t2)}</td>
                    
                          </tr>
                        `;
                      })
                      .join("");

                    return `
                      <div class="trend-box">
                        <div class="trend-title-right">Trends (last three reports)</div>
                        <table>
                          <thead>
                            <tr>
                              <th>Parameter</th>
                              <th>${escapeHtml(trendDates[0])}</th>
                              <th>${escapeHtml(trendDates[1])}</th>
                           
                            </tr>
                          </thead>
                          <tbody>${tRows}</tbody>
                        </table>
                      </div>
                    `;
                  })()
                : "";

            // ✅ If trends exist (first chunk), wrap in 70/30 grid
            const bodyHtml =
              trendsHtml
                ? `
                  <div class="two-col">
                    <div class="col-main">
                      ${mainTableHtml}
                    </div>
                    <div class="col-trend">
                      ${trendsHtml}
                    </div>
                  </div>
                `
                : mainTableHtml;

            return `
              <div class="page">
                <div class="title">Medical Diagnostic Report</div>
                ${patientStrip()}
                <div class="test-name">${testTitle}</div>
                ${bodyHtml}
                ${sigRow}
              </div>
            `;
          }

          // ✅ STANDARD mode (plain + letterhead) — keep same 3 columns
          return `
            <div class="page">
              <div class="title">Medical Diagnostic Report</div>
              ${patientStrip()}
              <div class="test-name">${testTitle}</div>
              ${mainTableHtml}
              ${sigRow}
            </div>
          `;
        })
        .join("")}
    </body>
  </html>
  `;
}

function buildFullImagePageHtml(imgUrl) {
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin:0; padding:0; width:210mm; height:297mm; overflow:hidden; }
        body { 
          -webkit-print-color-adjust: exact; 
          print-color-adjust: exact; 
          font-family: 'Inter', sans-serif;
        }

        .one-page {
          width: 210mm;
          height: 297mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
          page-break-after: avoid;
          break-after: avoid;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .one-page img {
          max-width: 100%;
          max-height: 100%;
          display: block;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <div class="one-page">
        ${imgUrl ? `<img src="${imgUrl}" alt="page" />` : ``}
      </div>
    </body>
  </html>
  `;
}

/* =========================================================
✅ Generate 3 PDFs for ONE patient
========================================================= */
export async function generatePatient3Pdfs({ orderId, patientId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { doctor: true },
  });
  if (!order) throw new Error("Order not found");

  const patient = await prisma.patient.findUnique({
    where: { id: Number(patientId) },
    select: {
      id: true,
      fullName: true,
      dob: true,
      gender: true,
      contactNo: true,
    },
  });
  if (!patient) throw new Error("Patient not found");

  const layout = await prisma.reportLayout.findFirst({
    orderBy: { id: "desc" },
  });

  const resultsRaw = await prisma.patientTestResult.findMany({
    where: { orderId: Number(orderId), patientId: Number(patientId) },
    include: {
      test: { select: { id: true, name: true, categoryId: true } },
      parameterResults: {
        include: { parameter: true },
        orderBy: { parameterId: "asc" },
      },
      leftSignature: true,
      centerSignature: true,
      rightSignature: true,
    },
    orderBy: { id: "asc" },
  });

  if (!resultsRaw.length) throw new Error("No results for this patient");

  const categoryIds = resultsRaw.map((r) => r.test?.categoryId).filter(Boolean);
  const defaultByCategory = await getDefaultSignaturesByCategory(categoryIds);

  const results = resultsRaw.map((r) => {
    const cid = r.test?.categoryId;
    const defs = cid ? defaultByCategory.get(cid) : null;
    return {
      ...r,
      sigLeft: r.leftSignature || defs?.LEFT || null,
      sigCenter: r.centerSignature || defs?.CENTER || null,
      sigRight: r.rightSignature || defs?.RIGHT || null,
    };
  });

  const trendMap = await buildTrendMap({ results, patientId });

  const optimizedHeader = await optimizeImageToDataUrl(layout?.headerImg, {
    width: 1400,
    height: 140,
    quality: 60,
    fit: "cover",
  });

  const optimizedFooter = await optimizeImageToDataUrl(layout?.footerImg, {
    width: 1400,
    height: 120,
    quality: 60,
    fit: "cover",
  });

  const optimizedCover = await optimizeImageToDataUrl(layout?.frontPageLastImg, {
    width: 1240,
    height: 1754,
    quality: 60,
    fit: "cover",
  });

  const optimizedLast = await optimizeImageToDataUrl(layout?.lastPageImg, {
    width: 1240,
    height: 1754,
    quality: 60,
    fit: "cover",
  });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  try {
    // 1) PLAIN
    const plainHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      mode: "standard",
      trendMap: null,
      headerImg: null,
      footerImg: null,
      reserveHeaderFooterSpace: true,
    });
    const plainPdf = await renderPdfFromHtml(browser, plainHtml);

    // 2) LETTERHEAD
    const letterHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      mode: "standard",
      trendMap: null,
      headerImg: optimizedHeader,
      footerImg: optimizedFooter,
      reserveHeaderFooterSpace: true,
    });
    const letterPdf = await renderPdfFromHtml(browser, letterHtml);

    // 3) FULL (cover + content(with trends) + last)
    const coverPdf = optimizedCover
      ? await renderSinglePagePdfFromHtml(browser, buildFullImagePageHtml(optimizedCover))
      : null;

    const fullContentHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      mode: "full",
      trendMap,
      headerImg: optimizedHeader,
      footerImg: optimizedFooter,
      reserveHeaderFooterSpace: true,
    });
    const fullContentPdf = await renderPdfFromHtml(browser, fullContentHtml);

    const lastPdf = optimizedLast
      ? await renderSinglePagePdfFromHtml(browser, buildFullImagePageHtml(optimizedLast))
      : null;

    const fullFinal = await PDFDocument.create();

    async function merge(buf) {
      const doc = await PDFDocument.load(buf);
      const pages = await fullFinal.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => fullFinal.addPage(p));
    }

    if (coverPdf) await merge(coverPdf);
    await merge(fullContentPdf);
    if (lastPdf) await merge(lastPdf);

    const fullFinalBytes = await fullFinal.save({ useObjectStreams: true });

    const plainCompressed = await compressPdfBuffer(Buffer.from(plainPdf), "/ebook");
    const letterCompressed = await compressPdfBuffer(Buffer.from(letterPdf), "/ebook");
    const fullCompressed = await compressPdfBuffer(Buffer.from(fullFinalBytes), "/ebook");

    return {
      plainBuffer: plainCompressed,
      letterheadBuffer: letterCompressed,
      fullBuffer: fullCompressed,
    };
  } finally {
    await browser.close();
  }
}