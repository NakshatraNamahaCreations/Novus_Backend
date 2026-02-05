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
    margin: { top: "0", right: "0", bottom: "0", left: "0" }, // ✅ Set to 0, CSS handles all spacing
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



function formatValueWithUnit(value, unit) {
  const v = value == null || String(value).trim() === "" ? "—" : String(value);
  const u = safeTrim(unit);
  if (!u || v === "—") return v;
  return `${v} ${u}`;
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
✅ Radiology splitter - IMPROVED
Character limit calculation:
- Available content height: ~772px (after header/footer/sig/padding)
- Average line height: 11px * 1.5 = 16.5px
- Lines per page: 772px / 16.5px ≈ 47 lines
- Average chars per line: ~40 chars
- Target: 47 lines * 40 chars = ~1880 chars
- Conservative: 1800 chars max, 900 chars min
-------------------------------------------------------- */
function splitRadiologyHtmlIntoPages(reportHtml, maxChars = 1800, minChars = 900) {
  const html = safeTrim(reportHtml);
  if (!html) return [""];

  // Normalize HTML with better line breaks
  let normalized = html
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "<br/>\n")
    .replace(/<\/p>/gi, "</p>\n")
    .replace(/<\/div>/gi, "</div>\n")
    .replace(/<\/li>/gi, "</li>\n")
    .replace(/<\/tr>/gi, "</tr>\n")
    .replace(/<\/h[1-6]>/gi, (match) => match + "\n")
    .replace(/<strong>/gi, "\n<strong>")
    .replace(/<b>/gi, "\n<b>");

  // Split into paragraphs/sections
  const sections = normalized
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const pages = [];
  let currentPage = "";
  let currentLength = 0;

  for (const section of sections) {
    const sectionLength = section.length;
    
    // If this single section is too long, split it
    if (sectionLength > maxChars) {
      if (currentPage) {
        pages.push(currentPage);
        currentPage = "";
        currentLength = 0;
      }
      
      // Split very long section into smaller chunks
      const words = section.split(/\s+/);
      let chunk = "";
      
      for (const word of words) {
        if ((chunk + " " + word).length > maxChars) {
          if (chunk) pages.push(chunk);
          chunk = word;
        } else {
          chunk = chunk ? chunk + " " + word : word;
        }
      }
      if (chunk) pages.push(chunk);
      continue;
    }

    // Check if adding this section would exceed limit
    if (currentLength + sectionLength + 1 > maxChars && currentPage) {
      pages.push(currentPage);
      currentPage = section;
      currentLength = sectionLength;
    } else {
      currentPage = currentPage ? currentPage + "\n" + section : section;
      currentLength += sectionLength + 1;
    }
  }

  if (currentPage) pages.push(currentPage);

  // Merge very short pages with adjacent ones
  const merged = [];
  for (let i = 0; i < pages.length; i++) {
    const current = pages[i];
    const next = pages[i + 1];
    
    // If current page is too short and there's a next page
    if (current.length < minChars && next && (current.length + next.length) < maxChars * 1.3) {
      pages[i + 1] = current + "\n" + next;
      continue;
    }
    
    merged.push(current);
  }

  // Handle last page if it's too short
  if (merged.length >= 2) {
    const last = merged[merged.length - 1];
    const secondLast = merged[merged.length - 2];
    
    if (last.length < minChars && (secondLast.length + last.length) < maxChars * 1.3) {
      merged[merged.length - 2] = secondLast + "\n" + last;
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
✅ Signatures - FIXED VERSION
-------------------------------------------------------- */
function renderSigCell(sig, pos /* "left"|"center"|"right" */) {
  const name = sig ? safeTrim(sig.name) : "";
  const desig = sig ? safeTrim(sig.designation) || safeTrim(sig.qualification) : "";
  const img = sig?.signatureImg ? `<img class="sig-img" src="${sig.signatureImg}" alt="signature" />` : "";

  // ✅ FIXED: Always render the container even if empty, to maintain spacing
  return `
    <div class="sig-cell ${pos}">
      <div class="sig-img-wrap">${img || '<div class="sig-placeholder"></div>'}</div>
      <div class="sig-name">${escapeHtml(name || "")}</div>
      <div class="sig-desig">${escapeHtml(desig || "")}</div>
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
✅ CSS - FIXED VERSION with proper footer spacing
-------------------------------------------------------- */
function buildCss({ headerH = 120, footerH = 70, sigH = 110, fontPx = 11.5 } = {}) {
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
      color: #000000;
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
      --primary-color: #000000;
      --secondary-color: #6b7280;
      --border-color: #e5e7eb;
      --light-bg: #f9fafb;
      --danger-color: #dc2626;
      --success-color: #059669;
      --page-height: 297mm;
      --page-width: 210mm;
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
      object-fit: contain;
      object-position: center;
      display: block;
    }
    .header.blank, .footer.blank { 
      background: transparent;
      border: none;
    }

    .page {
      position: relative;
      width: var(--page-width);
      height: var(--page-height); /* ✅ Exact height, not min-height */
      box-sizing: border-box;
      padding-top: calc(var(--header-h) + 15px);
      padding-left: 20px;
      padding-right: 20px;
      
padding-bottom: calc(var(--footer-h) + var(--sig-h) + 45px); /* ✅ Increased from 35px to 45px */
      page-break-after: always; /* ✅ Force page break after each .page */
      break-after: page;
      page-break-inside: avoid; /* ✅ Prevent breaking within page */
      break-inside: avoid;
      background: white;
      overflow: hidden; /* ✅ Hide overflow to prevent bleeding into next page */
    }
    

.page-content {
  max-height: calc(100% - 40px); /* ✅ Reserve space at bottom */
  overflow: hidden; /* ✅ Hide any overflow */
  position: relative;
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
      gap: 12px; /* ✅ Reduced from 15px */
      padding: 10px 12px; /* ✅ Reduced from 12px 15px */
      background: var(--light-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 15px; /* ✅ Reduced from 20px */
      font-size: 11px; /* ✅ Reduced from 11.5px */
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .patient-strip .col {
      min-width: 0;
    }
    
    .patient-strip .row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0; /* ✅ Reduced from 4px */
      align-items: center;
    }
    
    .patient-strip b {
      font-weight: 600;
      color: var(--secondary-color);
      min-width: 80px;
      font-size: 11px; /* ✅ Explicit size */
    }
    
    .patient-strip .value {
      font-weight: 500;
      color: #000000;
      text-align: right;
      flex: 1;
      font-size: 11px; /* ✅ Explicit size */
    }

.test-name {
  margin: 12px 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--primary-color);
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-color);
  page-break-after: avoid; /* ✅ Keep with following content */
  break-after: avoid;
}
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      margin-bottom: 20px; /* ✅ Increased from 10px to 20px for better separation */
    }
    
    th {
      background: var(--light-bg);
      padding: 9px 8px; /* ✅ Slightly reduced from 10px */
      font-weight: 600;
      text-align: left;
      color: var(--primary-color);
      border-bottom: 2px solid var(--border-color);
      font-size: 11px; /* ✅ Slightly reduced from 11.5px */
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 8px 8px; /* ✅ Slightly reduced from 9px */
      border-bottom: 1px solid var(--border-color);
      font-size: 11px; /* ✅ Slightly reduced from 11.5px */
      vertical-align: middle;
      line-height: 1.4; /* ✅ Added for better control */
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover td {
      background: #f8fafc;
    }

    .parameter-name {
      font-weight: 600;
      color: #000000;
      margin-bottom: 1px; /* ✅ Reduced from 2px */
      line-height: 1.3; /* ✅ Added for tighter spacing */
      font-size: 11px; /* ✅ Explicit size */
    }
    
    .method {
      color: var(--secondary-color);
      font-size: 10px; /* ✅ Reduced from 10.5px */
      font-weight: 400;
      margin-top: 1px; /* ✅ Reduced from 2px */
      line-height: 1.2; /* ✅ Added for tighter spacing */
    }

    .result-cell {
      font-weight: 500;
      position: relative;
      font-size: 11px; /* ✅ Explicit size */
      line-height: 1.4; /* ✅ Added */
    }
    
    .range-cell {
      color: var(--secondary-color);
      font-size: 10.5px; /* ✅ Slightly reduced */
      line-height: 1.4; /* ✅ Added */
    }

    .arrow {
      font-weight: 800;
      margin-left: 5px; /* ✅ Reduced from 6px */
      font-size: 12px; /* ✅ Reduced from 13px */
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

    /* ✅ FIXED: Signature row positioning and spacing */
 .sig-row {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: calc(var(--footer-h) + 25px); /* ✅ Increased from 20px to 25px */
  height: var(--sig-h);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
  align-items: flex-end;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
  box-sizing: border-box;
  background: white;
  z-index: 5;
  /* ✅ Ensure signatures don't break */
  page-break-inside: avoid;
  break-inside: avoid;
  page-break-before: avoid;
  break-before: avoid;
}
    
    .sig-cell {
      min-width: 0; /* ✅ Prevents overflow */
      min-height: 80px; /* ✅ ADDED: Minimum height to prevent collapse */
      display: flex;
      flex-direction: column;
      justify-content: flex-end; /* ✅ Align content to bottom */
    }
    
    .sig-cell.left { 
      text-align: left;
      align-items: flex-start; /* ✅ Added */
    }
    
    .sig-cell.center { 
      text-align: center;
      align-items: center; /* ✅ Added */
    }
    
    .sig-cell.right { 
      text-align: right;
      align-items: flex-end; /* ✅ Added */
    }

    .sig-img-wrap {
      min-height: 50px; /* ✅ ADDED: Reserve space for signature image */
      display: flex;
      align-items: flex-end;
      margin-bottom: 8px;
    }

    .sig-placeholder {
      height: 45px; /* ✅ ADDED: Placeholder height when no image */
      width: 100%;
    }

    .sig-img {
      max-height: 50px; /* ✅ Increased from 45px */
      max-width: 160px; /* ✅ Increased from 140px */
      object-fit: contain; /* ✅ Changed from cover to contain */
      display: block;
      filter: brightness(0.9);
    }
    
    .sig-name {
      font-weight: 700;
      color: var(--primary-color);
      margin-top: 6px; /* ✅ Increased spacing */
      font-size: 12px; /* ✅ Slightly larger */
      min-height: 18px; /* ✅ ADDED: Prevents collapse */
    }
    
    .sig-desig {
      color: var(--secondary-color);
      margin-top: 3px;
      font-size: 11px; /* ✅ Slightly larger */
      min-height: 16px; /* ✅ ADDED: Prevents collapse */
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
      gap: 15px; /* ✅ Reduced from 20px */
      align-items: start;
    }

    .col-trend {
      padding: 12px; /* ✅ Reduced from 15px */
      background: var(--light-bg);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .trend-title-right {
      font-weight: 700;
      margin: 0 0 10px; /* ✅ Reduced from 12px */
      color: var(--primary-color);
      font-size: 12px; /* ✅ Reduced from 13px */
      padding-bottom: 5px; /* ✅ Reduced from 6px */
      border-bottom: 1px solid var(--border-color);
    }
    
    .trend-box table {
      font-size: 10.5px; /* ✅ Reduced from 11px */
      background: white;
    }
    
    .trend-box th {
      background: #f1f5f9;
      font-size: 10px; /* ✅ Reduced from 10.5px */
      padding: 7px 6px; /* ✅ Explicit padding */
    }
    
    .trend-box td {
      padding: 6px 6px; /* ✅ Reduced from 7px */
      font-size: 10px; /* ✅ Reduced from 10.5px */
      line-height: 1.3; /* ✅ Added */
    }

    /* Radiology content styling */
    .radiology-wrap {
      margin-top: 12px; /* ✅ Reduced from 15px */
      margin-bottom: 20px; /* ✅ Added to match table margin-bottom */
      font-size: 11px; /* ✅ Reduced from 11.5px to match pathology */
      line-height: 1.5; /* ✅ Reduced from 1.55 */
      color: #000000;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    
    .radiology-wrap h1,
    .radiology-wrap h2,
    .radiology-wrap h3,
    .radiology-wrap h4 {
      color: var(--primary-color);
      margin-top: 10px; /* ✅ Reduced from 12px */
      margin-bottom: 5px; /* ✅ Reduced from 6px */
      font-weight: 600;
      line-height: 1.3;
    }
    
    .radiology-wrap p {
      margin: 5px 0; /* ✅ Reduced from 6px */
      text-align: justify;
      line-height: 1.5; /* ✅ Reduced from 1.55 */
    }
    
    .radiology-wrap strong,
    .radiology-wrap b {
      font-weight: 600;
      color: #000000;
    }
    
    .radiology-wrap ul,
    .radiology-wrap ol {
      margin: 5px 0 5px 20px; /* ✅ Reduced margins */
    }
    
    .radiology-wrap li {
      margin: 2px 0; /* ✅ Reduced from 3px */
      line-height: 1.5; /* ✅ Added tighter spacing */
    }
/* ✅ Patient strip (Image-like design) */
.ps-wrap {
  display: grid;
  grid-template-columns: 1fr 1.1fr 0.55fr;
  column-gap: 0;
  padding: 6px 0; /* ✅ Reduced from 8px */
  margin: 0 0 10px 0; /* ✅ Reduced from 12px */
  background: transparent;
  border: 0;
  page-break-after: avoid; /* ✅ Keep with content */
  break-after: avoid;
}

.ps-col{
  padding: 0 14px;
  min-width: 0;
}

/* vertical separators */
.ps-mid{
  border-left: 2px solid #d1d5db;
}
.ps-right{
  border-left: 2px solid #d1d5db;
}

.ps-name{
  font-weight: 800;
  font-size: 16px;
  line-height: 1.15;
  margin-bottom: 6px;
}

.ps-age{
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 14px;
}

.ps-kv{
  display: flex;
  gap: 8px;
  font-size: 11px;
  margin: 4px 0;
}

.ps-row{
  display: flex;
  gap: 8px;
  font-size: 11px;
  margin: 4px 0;
}

.ps-k{
  color: #6b7280;
  font-weight: 600;
  white-space: nowrap;
}

.ps-v{
  color: #111827;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.ps-right-wrap{
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  align-items: flex-start;
}

.ps-stamp{
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.ps-stamp-img{
  width: 62px;
  height: 62px;
  object-fit: contain;
  display: block;
}

.ps-stamp-code{
  margin-top: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #111827;
}

.ps-qr-img{
  width: 82px;
  height: 82px;
  object-fit: contain;
  display: block;
}

/* placeholders if image not provided */
.ph{
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

    /* Print optimizations */
    @media print {
      body {
        font-size: 11px;
      }
      
      .patient-strip {
        box-shadow: none;
        border: 1px solid #ccc;
        page-break-inside: avoid; /* ✅ Prevent breaking */
        break-inside: avoid;
      }
      
      .test-name {
        page-break-after: avoid; /* ✅ Keep with content */
        break-after: avoid;
      }
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  margin-bottom: 15px; /* ✅ Reduced from 20px */
  page-break-inside: auto; /* ✅ Allow breaking within tables */
  break-inside: auto;
}

/* ✅ Ensure last row doesn't get orphaned */
tr:last-child td {
  border-bottom: 1px solid var(--border-color);
  page-break-before: avoid;
  break-before: avoid;
}
      
      /* ✅ Prevent orphan rows */
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      
      thead {
        page-break-after: avoid;
        break-after: avoid;
      }
      
      tr:hover td {
        background: transparent;
      }
      
      .two-col, 
      .col-main, 
      .col-trend { 
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* ✅ Ensure signatures don't break across pages */
      .sig-row {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      
      /* ✅ Keep content wrapper intact */
      .page-content {
        page-break-inside: auto;
        break-inside: auto;
      }
    }
  </style>
  `;
}

/* -----------------------------
✅ Build content HTML
----------------------------- */

/* -----------------------------
✅ Build content HTML - FIXED VERSION with larger font
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
  layout = null,
  qrImg = null,
  stampImg = null,
  stampCode = "",
}) {
  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  const isFull = mode === "full";
  const refDoctor = getRefDoctorDisplay(order);

  // ✅ Further reduced rows per page due to larger font size
  const ROWS_PER_PAGE_FULL = 7;   // Reduced from 8
  const ROWS_PER_PAGE_STD = 12;   // Reduced from 14

  const pages = [];

  for (const r of results) {
    const testId = r.testId ?? r.test?.id;
    const testName = safeTrim(r.test?.name) || "Test";

    // Handle radiology reports (HTML content)
    if (isHtmlPresent(r.reportHtml)) {
      const parts = splitRadiologyHtmlIntoPages(r.reportHtml, 1600, 800);
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

    // Handle pathology tests (tabular data)
    const prs = r.parameterResults || [];
    
    if (!prs.length) {
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
    
    const perPage = isFull ? ROWS_PER_PAGE_FULL : ROWS_PER_PAGE_STD;
    const chunks = chunkArray(prs, perPage);
    const chunkCount = chunks.length;

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

  // ✅ INCREASED FONT SIZE from 11 to 12.5
  const css = buildCss({
    headerH: reserveHeaderFooterSpace ? 120 : headerImg ? 120 : 0,
    footerH: reserveHeaderFooterSpace ? 75 : footerImg ? 75 : 0,
    sigH: 120,
    fontPx: 12.5, // ✅ Increased font size
  });

  const headerClass = headerImg ? "header" : "header blank";
  const footerClass = footerImg ? "footer" : "footer blank";

  const patientStrip = (meta = {}) => {
    const {
      reportRefId = order?.reportRefId || order?.orderNumber || order?.id || "—",
      patientUid = patient?.patientUid || patient?.uhid || patient?.labPatientId || String(patient?.id || "—"),
      collectedAt = order?.collectedAt || order?.sampleCollectedAt || order?.createdAt || null,
      receivedAt = order?.receivedAt || order?.sampleReceivedAt || null,
      reportedAt = order?.reportedAt || order?.reportDate || new Date(),
      refBy = refDoctor || "—",
      partner = order?.partnerName || order?.partner || "—",
      qrImg = meta.qrImg || null,
      stampImg = meta.stampImg || null,
      stampCode = meta.stampCode || "",
    } = meta;

    const fmtDT = (d) => {
      if (!d) return "—";
      try {
        return new Date(d).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      } catch {
        return "—";
      }
    };

    return `
    <div class="ps-wrap">
      <div class="ps-col ps-left">
        <div class="ps-name">${escapeHtml(patient.fullName || "N/A")}</div>
        <div class="ps-age">${escapeHtml(String(calculateAge(patient.dob)))} Year(s)/${escapeHtml(patient.gender || "N/A")}</div>
        <div class="ps-kv">
          <span class="ps-k">Ref. by :</span>
          <span class="ps-v">${escapeHtml(refBy)}</span>
        </div>
        <div class="ps-kv">
          <span class="ps-k">Partner :</span>
          <span class="ps-v">${escapeHtml(partner)}</span>
        </div>
      </div>

      <div class="ps-col ps-mid">
        <div class="ps-row"><span class="ps-k">Report Ref. ID :</span><span class="ps-v">${escapeHtml(String(reportRefId))}</span></div>
        <div class="ps-row"><span class="ps-k">Patient ID :</span><span class="ps-v">${escapeHtml(String(patientUid))}</span></div>
        <div class="ps-row"><span class="ps-k">Collected :</span><span class="ps-v">${escapeHtml(fmtDT(collectedAt))}</span></div>
        <div class="ps-row"><span class="ps-k">Received :</span><span class="ps-v">${escapeHtml(fmtDT(receivedAt))}</span></div>
        <div class="ps-row"><span class="ps-k">Reported :</span><span class="ps-v">${escapeHtml(fmtDT(reportedAt))}</span></div>
      </div>

      <div class="ps-col ps-right">
        <div class="ps-right-wrap">
          <div class="ps-stamp">
            ${stampImg ? `<img class="ps-stamp-img" src="${stampImg}" alt="stamp" />` : `<div class="ps-stamp-img ph"></div>`}
            <div class="ps-stamp-code">${escapeHtml(stampCode)}</div>
          </div>
          <div class="ps-qr">
            ${qrImg ? `<img class="ps-qr-img" src="${qrImg}" alt="qr" />` : `<div class="ps-qr-img ph"></div>`}
          </div>
        </div>
      </div>
    </div>
    `;
  };

  // ✅ HELPER: Format value without unit
  function formatValueWithoutUnit(value) {
    const v = value == null || String(value).trim() === "" ? "—" : String(value);
    // Extract only the numeric part (remove unit)
    const match = v.match(/^([\d.]+)/);
    return match ? match[1] : v;
  }

  // ✅ HELPER: Format range with unit
  function formatRangeWithUnitForDisplay(rangeText, unit) {
    const rt = safeTrim(rangeText);
    const u = safeTrim(unit);
    if (!rt) return "—";
    if (!u) return rt;
    if (rt.toLowerCase().includes(u.toLowerCase())) return rt;
    return `${rt} ${u}`;
  }

  // ✅ UPDATED: Render result with colored arrows and no unit
  function renderResultWithColoredArrow(valueText, flag) {
    const kind = getFlagKind(flag);
    const numericValue = formatValueWithoutUnit(valueText);
    
    // Apply color to the entire result cell based on flag
    let colorClass = "";
    if (kind === "high") colorClass = "result-high";
    else if (kind === "low") colorClass = "result-low";
    
    const arrow = kind === "high" ? "↑" : kind === "low" ? "↓" : "";
    
    return `
      <span class="result-value ${colorClass}">
        ${escapeHtml(numericValue)}
        ${arrow ? `<span class="arrow">${arrow}</span>` : ''}
      </span>
    `;
  }

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
                <div class="page-content">
                  ${patientStrip({
                    reportRefId: order?.reportRefId || order?.orderNumber || order?.id,
                    patientUid: order?.patientUid || patient?.id,
                    collectedAt: order?.collectedAt,
                    receivedAt: order?.receivedAt,
                    reportedAt: r?.reportedAt || r?.createdAt || new Date(),
                    refBy: refDoctor,
                    partner: order?.partnerName || "-",
                    qrImg: order?.qrImg || null,
                    stampImg: layout?.sealImg || null,
                    stampCode: layout?.sealCode || "MC-6367",
                  })}

                  <div class="test-name">${testTitle}</div>
                  <div class="radiology-wrap">
                    ${reportChunk || ""}
                  </div>
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
                
                const rangeText = getReferenceRangeText(pr);
                const rangeCell = formatRangeWithUnitForDisplay(rangeText, unit);
                
                // Determine status class for badge
                const statusClass = flag === "high" ? "status-high" : 
                                  flag === "low" ? "status-low" : 
                                  "status-normal";
                
                // Add status badge if not normal
                const statusBadge = flag !== "normal" ? 
                  `<span class="status-badge ${statusClass}">${flag}</span>` : "";
                
                return `
                  <tr>
                    <td style="width:45%">
                      <div class="parameter-name">
                        <strong>${escapeHtml(pr.parameter?.name || "—")}</strong>
                        ${statusBadge}
                      </div>
                      <div class="method">${escapeHtml(method || "-")}</div>
                    </td>
                    <td style="width:20%" class="result-cell">
                      ${renderResultWithColoredArrow(valueRaw, pr.flag)}
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
                  <th style="width:45%">PARAMETER / METHOD</th>
                  <th style="width:20%">RESULT</th>
                  <th style="width:35%">BIO REF. INTERVAL</th>
                </tr>
              </thead>
              <tbody>${buildMainRows(prsForThisPage)}</tbody>
            </table>
          `;

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
                        const t3 = safeTrim(tArr[2]?.value) || "—";
                        
                        return `
                          <tr>
                            <td style="width:40%"><b>${escapeHtml(pr.parameter?.name || "—")}</b></td>
                            <td style="width:20%">${escapeHtml(t1)}</td>
                            <td style="width:20%">${escapeHtml(t2)}</td>
                            <td style="width:20%">${escapeHtml(t3)}</td>
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
                              <th>${escapeHtml(trendDates[2])}</th>
                            </tr>
                          </thead>
                          <tbody>${tRows}</tbody>
                        </table>
                      </div>
                    `;
                  })()
                : "";

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
                <div class="page-content">
                  ${patientStrip({
                    reportRefId: order?.reportRefId || order?.orderNumber || order?.id,
                    patientUid: order?.patientUid || patient?.id,
                    collectedAt: order?.collectedAt,
                    receivedAt: order?.receivedAt,
                    reportedAt: r?.reportedAt || r?.createdAt || new Date(),
                    refBy: refDoctor,
                    partner: order?.partnerName || "-",
                    qrImg: order?.qrImg || null,
                    stampImg: layout?.sealImg || null,
                    stampCode: layout?.sealCode || "MC-6367",
                  })}

                  <div class="test-name">${testTitle}</div>
                  ${bodyHtml}
                </div>
                ${sigRow}
              </div>
            `;
          }

          return `
            <div class="page">
              <div class="page-content">
                ${patientStrip({
                  reportRefId: order?.reportRefId || order?.orderNumber || order?.id,
                  patientUid: order?.patientUid || patient?.id,
                  collectedAt: order?.collectedAt,
                  receivedAt: order?.receivedAt,
                  reportedAt: r?.reportedAt || r?.createdAt || new Date(),
                  refBy: refDoctor,
                  partner: order?.partnerName || "-",
                  qrImg: order?.qrImg || null,
                  stampImg: layout?.sealImg || null,
                  stampCode: layout?.sealCode || "MC-6367",
                })}

                <div class="test-name">${testTitle}</div>
                ${mainTableHtml}
              </div>
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
       // ✅ PASS HERE
  layout,
  stampImg: layout?.sealImg || null,
  stampCode: layout?.sealCode || "MC-6367",
  qrImg: order?.qrImg || null,
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
