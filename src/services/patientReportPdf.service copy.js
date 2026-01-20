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
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 0.98,
    ...pdfOptions,
  });

  await page.close();
  return pdf;
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

function formatValueWithUnit(value, unit) {
  const v = value == null ? "—" : String(value);
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

/**
 * ✅ Fix: Reference Range not coming
 */
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
    pr.lowerLimit ??
    pr.parameter?.ranges?.[0]?.lowerLimit ??
    pr.parameter?.lowerLimit ??
    null;

  const upper =
    pr.upperLimit ??
    pr.parameter?.ranges?.[0]?.upperLimit ??
    pr.parameter?.upperLimit ??
    null;

  const hasLower = lower !== null && lower !== undefined && String(lower) !== "";
  const hasUpper = upper !== null && upper !== undefined && String(upper) !== "";

  if (hasLower || hasUpper) {
    return `${hasLower ? lower : ""}${hasLower || hasUpper ? " - " : ""}${hasUpper ? upper : ""}`.trim();
  }

  return "";
}

/* -------------------------------------------------------
   ✅ Image optimization (BIGGEST pdf size reducer)
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

    // ✅ if sharp not installed, return original URL
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
   Trend data: last 3 previous reports per test
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
    if (arr.some((item) => item.value && safeTrim(item.value) !== "" && safeTrim(item.value) !== "—")) {
      return true;
    }
  }
  return false;
}

function getRefDoctorDisplay(order) {
  const d = order?.doctor;
  if (!d) return "N/A";
  if (typeof d === "string") return safeTrim(d) || "N/A";
  return safeTrim(d.name || d.fullName || d.doctorName || d.displayName || "") || "N/A";
}

/* -------------------------------------------------------
   ✅ Default signatures by Category (fallback)
   - if manual signature missing -> use category default by alignment
-------------------------------------------------------- */
async function getDefaultSignaturesByCategory(categoryIds = []) {
  console.log("categoryIds",categoryIds)
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
          alignment: true, // LEFT/CENTER/RIGHT
        },
      },
    },
  });

  console.log("rows",rows)

  const map = new Map(); // categoryId -> { LEFT, CENTER, RIGHT }
  for (const row of rows) {
    const cid = row.categoryId;
    if (!map.has(cid)) map.set(cid, { LEFT: null, CENTER: null, RIGHT: null });

    const sig = row.signature;
    if (!sig) continue;

    const bucket = map.get(cid);
    const a = String(sig.alignment || "").toUpperCase();

    // first wins (so you can keep only one default per alignment)
    if (a === "LEFT" && !bucket.LEFT) bucket.LEFT = sig;
    else if (a === "CENTER" && !bucket.CENTER) bucket.CENTER = sig;
    else if (a === "RIGHT" && !bucket.RIGHT) bucket.RIGHT = sig;
  }

  return map;
}

/* -------------------------------------------------------
   ✅ Signature render helpers (proper alignment + fixed at bottom)
-------------------------------------------------------- */
function renderSigBlock(sig, pos /* "left"|"center"|"right" */) {
  const posCls = pos === "center" ? "center" : pos === "right" ? "right" : "left";

  const name = sig ? safeTrim(sig.name) : "";
  const desig = sig ? safeTrim(sig.designation) || safeTrim(sig.qualification) : "";

  const img = sig?.signatureImg
    ? `<img class="sig-img" src="${sig.signatureImg}" />`
    : `<span class="sig-line"></span>`;

  return `
    <div class="sig ${posCls}">
      <div class="sig-inner">
        ${sig ? img : `<span class="sig-line"></span>`}
        <div class="sig-name">${name || "&nbsp;"}</div>
        <div class="sig-desig">${desig || "&nbsp;"}</div>
      </div>
    </div>
  `;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < (arr?.length || 0); i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* -----------------------------
   ✅ Build content HTML
   ✅ FIX: long test => chunk into multiple pages (no collapse)
----------------------------- */
function buildPatientContentHtml({
  order,
  patient,
  results,
  withLetterhead,
  mode = "standard",
  trendMap = null,
  headerImg = null,
  footerImg = null,
}) {
  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  const isFull = mode === "full";
  const refDoctor = getRefDoctorDisplay(order);

  // header/footer image fixed
  const HEADER_H = 120; // px
  const FOOTER_H = 75;  // px

  // signature block reserved space
  const SIG_H = 80;     // px (adjust if needed)

  const showHeader = Boolean(withLetterhead && safeTrim(headerImg));
  const showFooter = Boolean(withLetterhead && safeTrim(footerImg));

  // ✅ rows per page (tune if needed)
  // full mode has split layout so fewer rows fit
  const ROWS_PER_PAGE_FULL = 14;
  const ROWS_PER_PAGE_STD  = 26;

  // ✅ Expand "results" into "pages"
  // If a test has many parameterResults => make multiple pages for that test
  const pages = [];

  for (const r of results) {
    const isRadiology = isHtmlPresent(r.reportHtml);

    if (isRadiology) {
      // radiology may also be long, but usually it flows ok in one page container;
      // if you need, we can chunk radiology too (harder). For now keep as 1 page.
      pages.push({ r, chunk: null, chunkIndex: 0, chunkCount: 1 });
      continue;
    }

    const prs = r.parameterResults || [];
    const perPage = isFull ? ROWS_PER_PAGE_FULL : ROWS_PER_PAGE_STD;

    const chunks = chunkArray(prs, perPage);
    if (!chunks.length) {
      pages.push({ r, chunk: [], chunkIndex: 0, chunkCount: 1 });
      continue;
    }

    chunks.forEach((chunk, idx) => {
      pages.push({ r, chunk, chunkIndex: idx, chunkCount: chunks.length });
    });
  }

  const totalPages = pages.length;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }

        html, body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 9px;
          color: #2c3e50;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        :root{
          --header-h: ${HEADER_H}px;
          --footer-h: ${FOOTER_H}px;
          --sig-h: ${SIG_H}px;

          --pad-top: 15mm;
          --pad-right: 15mm;
          --pad-bottom: 12mm;
          --pad-left: 15mm;
        }

        .global-header{
          position: fixed;
          top: 0; left: 0; right: 0;
          width: 100%;
          height: var(--header-h);
          z-index: 9999;
          background: #fff;
          overflow: hidden;
        }
        .global-footer{
          position: fixed;
          bottom: 0; left: 0; right: 0;
          width: 100%;
          height: var(--footer-h);
          z-index: 9999;
          background: #fff;
          overflow: hidden;
        }
        .global-header img,
        .global-footer img{
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .main-content{ position: relative; z-index: 1; }

        /* ✅ one physical page */
        .test-page{
          position: relative;
          height: 297mm; /* A4 height */
          box-sizing: border-box;
          page-break-after: always;

          padding-top: calc(var(--header-h) + var(--pad-top));
          padding-right: var(--pad-right);
          padding-left: var(--pad-left);

          /* ✅ reserve footer + signature at bottom */
          padding-bottom: calc(var(--footer-h) + var(--sig-h) + var(--pad-bottom));
        }
        .test-page:last-child{ page-break-after: auto; }

        .header {
          text-align: center;
          border-bottom: 2px solid #4a90e2;
          margin-bottom: 12px;
          padding-bottom: 8px;
        }
        .header h2 {
          font-size: 11px;
          font-weight: 400;
          color: #5a6c7d;
        }

        .patient-info {
          background: #f7f9fc;
          padding: 10px 12px;
          margin-bottom: 15px;
          border-left: 3px solid #4a90e2;
          border-radius: 3px;
          font-size: 9px;
          line-height: 1.6;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 10px;
        }
        .patient-info b {
          display: inline-block;
          min-width: 70px;
          font-weight: 600;
        }

        .test-title {
          background: linear-gradient(135deg, #4a90e2 0%, #5da8f5 100%);
          color: #fff;
          padding: 9px 12px;
          font-size: 10px;
          font-weight: 600;
          margin-bottom: 15px;
          border-radius: 4px;
        }

        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 8.5px;
          border: 1px solid #e1e8ed;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        thead { background: #f0f4f8; }
        th {
          padding: 8px 9px;
          text-align: left;
          font-weight: 600;
          color: #2c3e50;
          text-transform: uppercase;
          font-size: 7.5px;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #d1dce5;
          vertical-align: bottom;
        }
        thead tr.subhead th {
          text-transform: none;
          font-size: 7.5px;
          border-bottom: 2px solid #d1dce5;
          padding-top: 6px;
          padding-bottom: 6px;
        }
        td {
          padding: 8px 9px;
          border-bottom: 1px solid #e9eff4;
          color: #4a5568;
          vertical-align: top;
        }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:nth-child(even) { background-color: #fafbfc; }

        .flag-high, .flag-low, .flag-critical {
          color: #e74c3c;
          font-weight: 600;
          font-size: 7.5px;
          background-color: #fee;
          padding: 3px 7px;
          border-radius: 3px;
          display: inline-block;
        }
        .flag-normal {
          color: #27ae60;
          font-weight: 600;
          font-size: 7.5px;
          background-color: #eafaf1;
          padding: 3px 7px;
          border-radius: 3px;
          display: inline-block;
        }

        .radiology-html {
          font-size: 9px;
          line-height: 1.7;
          color: #2c3e50;
          padding: 12px;
          background: #fafbfc;
          border: 1px solid #e1e8ed;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .split-container {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
        }
        .split-left { flex: 0 0 62%; min-width: 0; }
        .split-right { flex: 1; min-width: 0; display: flex; flex-direction: column; }

        .table-card {
          border: 1px solid #e1e8ed;
          border-radius: 5px;
          overflow: hidden;
          background: #fff;
          height: 100%;
        }
        .table-card table { border: none; border-radius: 0; margin-bottom: 0; }

        .trends-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 30px 20px;
          color: #9aa6b2;
          text-align: center;
          background: #fff;
          border: 1px dashed #d1dce5;
          border-radius: 5px;
          height: 100%;
        }

        /* ✅ SIGNATURES fixed at bottom per page */
        .signature-wrap{
          position: absolute;
          left: var(--pad-left);
          right: var(--pad-right);
          bottom: calc(var(--footer-h) + 22px);
          height: var(--sig-h);
          box-sizing: border-box;
          border-top: 1px solid #e1e8ed;
          padding-top: 10px;
        }
        .signature-row{
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        .sig{ width: 33.333%; }
        .sig-inner{ display: flex; flex-direction: column; gap: 2px; }
        .sig.left .sig-inner{ align-items: flex-start; text-align:left; }
        .sig.center .sig-inner{ align-items: center; text-align:center; }
        .sig.right .sig-inner{ align-items: flex-end; text-align:right; }

        .sig-img{
          height: 34px;
          max-width: 150px;
          width: auto;
          object-fit: contain;
          display: block;
        }
        .sig-line{
          width: 150px;
          height: 1px;
          background: #cfd8e3;
          display: inline-block;
          margin-top: 18px;
        }
        .sig-name{ font-size: 9px; font-weight: 700; color: #2c3e50; line-height: 1.2; }
        .sig-desig{ font-size: 8px; color: #6b7280; line-height: 1.2; }

        .page-note{
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(var(--footer-h) + 6px);
          text-align: center;
          font-size: 7.5px;
          color: #95a5a6;
        }
      </style>
    </head>

    <body>
      <div class="global-header">${showHeader ? `<img src="${headerImg}" />` : ``}</div>
      <div class="global-footer">${showFooter ? `<img src="${footerImg}" />` : ``}</div>

      <div class="main-content">
        ${pages.map(({ r, chunk, chunkIndex, chunkCount }, pageIdx) => {
          const isRadiology = isHtmlPresent(r.reportHtml);
          const testId = r.testId ?? r.test?.id;

          const hasTrends =
            isFull && trendMap ? hasAnyTrendsForTest(trendMap, testId, r.parameterResults) : false;

          // ✅ Show patient header only on first chunk page for that test
          const showTopInfo = chunkIndex === 0;

          // ✅ Parameter list for this page
          const prsForThisPage = isRadiology ? [] : (chunk || []);

          return `
            <div class="test-page">
              ${showTopInfo ? `
                <div class="header"><h2>Medical Diagnostic Report</h2></div>

                <div class="patient-info">
                  <div class="info-grid">
                    <div><b>Order ID:</b> ${order.orderNumber || order.id}</div>
                    <div><b>Date:</b> ${reportDate}</div>
                    <div><b>Name:</b> ${patient.fullName || "N/A"}</div>
                    <div><b>Age:</b> ${calculateAge(patient.dob)} years</div>
                    <div><b>Gender:</b> ${patient.gender || "N/A"}</div>
                    <div><b>Ref. Dr:</b> ${refDoctor}</div>
                  </div>
                </div>

                <div class="test-title">
                  ${r.test?.name || "Test"}
                  ${chunkCount > 1 ? ` <span style="opacity:.85; font-weight:500;">(Part ${chunkIndex + 1}/${chunkCount})</span>` : ``}
                </div>
              ` : `
                <div class="test-title">
                  ${r.test?.name || "Test"}
                  <span style="opacity:.85; font-weight:500;">(Part ${chunkIndex + 1}/${chunkCount})</span>
                </div>
              `}

              ${
                isRadiology
                  ? `<div class="radiology-html">${r.reportHtml}</div>`
                  : isFull
                    ? `
                      <div class="split-container">
                        <div class="split-left">
                          <div class="table-card">
                            <table>
                              <thead>
                                <tr>
                                  <th style="width:46%">Test Name</th>
                                  <th style="width:26%">Result, ${reportDate}</th>
                                  <th style="width:28%">Bio Ref. Interval</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${prsForThisPage.map((pr) => {
                                  const valueRaw = pr.valueNumber ?? pr.valueText ?? "—";
                                  const unit = pr.unit || pr.parameter?.unit || "";
                                  const method = pr.method || pr.parameter?.method || "";
                                  const valueCell = formatValueWithUnit(valueRaw, unit);

                                  const rangeText = getReferenceRangeText(pr);
                                  const rangeCell = formatRangeWithUnit(rangeText, unit);

                                  const flagLower = safeTrim(pr.flag).toLowerCase();
                                  let flagClass = "flag-normal";
                                  if (flagLower.includes("critical")) flagClass = "flag-critical";
                                  else if (flagLower.includes("high")) flagClass = "flag-high";
                                  else if (flagLower.includes("low")) flagClass = "flag-low";

                                  return `
                                    <tr>
                                      <td>
                                        <strong>${pr.parameter?.name || "—"}</strong>
                                        <div style="margin-top:4px; font-size:7.5px; color:#6b7280;">
                                          ${method || "-"}
                                        </div>
                                      </td>
                                      <td>
                                        ${valueCell}
                                        <div style="margin-top:4px;">
                                          <span class="${flagClass}">${pr.flag || "NORMAL"}</span>
                                        </div>
                                      </td>
                                      <td>${rangeCell || "—"}</td>
                                    </tr>
                                  `;
                                }).join("")}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div class="split-right">
                          <div class="table-card">
                            ${
                              // ✅ show trends only on the FIRST page of that test
                              showTopInfo
                                ? (hasTrends
                                    ? (() => {
                                        let trendDates = ["Date 1", "Date 2", "Date 3"];
                                        if (r.parameterResults?.length > 0) {
                                          const firstParamId = r.parameterResults[0]?.parameterId;
                                          const arr = trendMap.get(`${testId}:${firstParamId}`) || [];
                                          trendDates = [
                                            formatShortDate(arr[0]?.date) || "Date 1",
                                            formatShortDate(arr[1]?.date) || "Date 2",
                                            formatShortDate(arr[2]?.date) || "Date 3",
                                          ];
                                        }

                                        return `
                                          <div class="trends-table">
                                            <table>
                                              <thead>
                                                <tr>
                                                  <th colspan="3" style="text-align:center;">Trends (For last three tests)</th>
                                                </tr>
                                                <tr class="subhead">
                                                  <th style="text-align:center;">${trendDates[0]}</th>
                                                  <th style="text-align:center;">${trendDates[1]}</th>
                                                  <th style="text-align:center;">${trendDates[2]}</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                ${(r.parameterResults || []).map((pr) => {
                                                  const tArr = trendMap.get(`${testId}:${pr.parameterId}`) || [];
                                                  const t1 = safeTrim(tArr[0]?.value) || "";
                                                  const t2 = safeTrim(tArr[1]?.value) || "";
                                                  const t3 = safeTrim(tArr[2]?.value) || "";
                                                  return `
                                                    <tr>
                                                      <td style="text-align:center;">${t1}</td>
                                                      <td style="text-align:center;">${t2}</td>
                                                      <td style="text-align:center;">${t3}</td>
                                                    </tr>
                                                  `;
                                                }).join("")}
                                              </tbody>
                                            </table>
                                          </div>
                                        `;
                                      })()
                                    : `
                                      <div class="trends-empty">
                                        <div style="font-size:26px; opacity:.5;">📄</div>
                                        <div class="msg">
                                          We don't have any of your previous lab results for this test in our records
                                        </div>
                                      </div>
                                    `)
                                : `<div style="height:100%; background:#fff;"></div>`
                            }
                          </div>
                        </div>
                      </div>
                    `
                    : `
                      <div class="standard-table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Parameter</th>
                              <th>Value</th>
                              <th>Unit</th>
                              <th>Reference Range</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${prsForThisPage.map((pr) => {
                              const value = pr.valueNumber ?? pr.valueText ?? "—";
                              const unit = pr.unit || pr.parameter?.unit || "—";

                              const flagLower = safeTrim(pr.flag).toLowerCase();
                              let flagClass = "flag-normal";
                              if (flagLower.includes("critical")) flagClass = "flag-critical";
                              else if (flagLower.includes("high")) flagClass = "flag-high";
                              else if (flagLower.includes("low")) flagClass = "flag-low";

                              const rangeText = getReferenceRangeText(pr);
                              const rangeCell = safeTrim(rangeText) ? rangeText : "—";

                              return `
                                <tr>
                                  <td>${pr.parameter?.name || "—"}</td>
                                  <td>${value}</td>
                                  <td>${unit}</td>
                                  <td>${rangeCell}</td>
                                  <td><span class="${flagClass}">${pr.flag || "NORMAL"}</span></td>
                                </tr>
                              `;
                            }).join("")}
                          </tbody>
                        </table>
                      </div>
                    `
              }

              <!-- ✅ SIGNATURES FIXED ABOVE FOOTER (same on every part page of this test) -->
              <div class="signature-wrap">
                <div class="signature-row">
                  ${renderSigBlock(r.sigLeft, "left")}
                  ${renderSigBlock(r.sigCenter, "center")}
                  ${renderSigBlock(r.sigRight, "right")}
                </div>
              </div>

              <div class="page-note">Page: ${pageIdx + 1} / ${totalPages}</div>
            </div>
          `;
        }).join("")}
      </div>
    </body>
  </html>
  `;
}


function buildFullImagePageHtml(imgUrl) {
  return `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin:0; padding:0; height:100%; }
        img { width:100%; height:100%; object-fit:cover; display:block; }
      </style>
    </head>
    <body>
      ${imgUrl ? `<img src="${imgUrl}" />` : ""}
    </body>
  </html>
  `;
}

/* =========================================================
   ✅ Generate 3 PDFs for ONE patient
   ✅ Manual signature -> else category default signature
   ✅ Signatures fixed above footer
========================================================= */
export async function generatePatient3Pdfs({ orderId, patientId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { doctor: true },
  });
  if (!order) throw new Error("Order not found");

  const patient = await prisma.patient.findUnique({
    where: { id: Number(patientId) },
    select: { id: true, fullName: true, dob: true, gender: true, contactNo: true },
  });
  if (!patient) throw new Error("Patient not found");

  const layout = await prisma.reportLayout.findFirst({ orderBy: { id: "desc" } });

  const resultsRaw = await prisma.patientTestResult.findMany({
    where: { orderId: Number(orderId), patientId: Number(patientId) },
    include: {
      test: { select: { id: true, name: true, categoryId: true } },
      parameterResults: {
        include: { parameter: true },
        orderBy: { parameterId: "asc" },
      },

      // ✅ manual override signatures
      leftSignature: true,
      centerSignature: true,
      rightSignature: true,
    },
    orderBy: { id: "asc" },
  });
  if (!resultsRaw.length) throw new Error("No results for this patient");

  // ✅ build default signatures map by category
  const categoryIds = resultsRaw.map((r) => r.test?.categoryId).filter(Boolean);
  const defaultByCategory = await getDefaultSignaturesByCategory(categoryIds);

  // ✅ attach final signatures per result (manual -> else default)
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

  // ✅ compress header/footer (repeated every page)
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

  // ✅ cover/last compress
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
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // 1) PLAIN
    const plainHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      withLetterhead: false,
      mode: "standard",
      trendMap: null,
      headerImg: null,
      footerImg: null,
    });
    const plainPdf = await renderPdfFromHtml(browser, plainHtml);



    // 2) LETTERHEAD
    const letterHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      withLetterhead: true,
      mode: "standard",
      trendMap: null,
      headerImg: optimizedHeader,
      footerImg: optimizedFooter,
    });
    const letterPdf = await renderPdfFromHtml(browser, letterHtml);

    // 3) FULL = cover + full content + last
    const coverPdf = optimizedCover
      ? await renderPdfFromHtml(browser, buildFullImagePageHtml(optimizedCover))
      : null;

    const fullContentHtml = buildPatientContentHtml({
      order,
      patient,
      results,
      withLetterhead: true,
      mode: "full",
      trendMap,
      headerImg: optimizedHeader,
      footerImg: optimizedFooter,
    });
    const fullContentPdf = await renderPdfFromHtml(browser, fullContentHtml);

    const lastPdf = optimizedLast
      ? await renderPdfFromHtml(browser, buildFullImagePageHtml(optimizedLast))
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

    // ✅ Post-compress ALL PDFs (if gs installed)
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
