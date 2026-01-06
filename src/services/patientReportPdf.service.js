import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* -----------------------------
   Helper: render HTML -> PDF
----------------------------- */
async function renderPdfFromHtml(browser, html, pdfOptions = {}) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
    ...pdfOptions,
  });

  await page.close();
  return pdf;
}

/* -----------------------------
   Helper: Calculate Age (Patient.dob)
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

/**
 * Put unit inside Result cell (ex: 13.9 g/dL)
 */
function formatValueWithUnit(value, unit) {
  const v = value == null ? "—" : String(value);
  const u = safeTrim(unit);
  if (!u || v === "—") return v;
  return `${v} ${u}`;
}

/**
 * Put unit inside Bio Ref Interval when needed.
 * If range already contains unit, keep as-is.
 */
function formatRangeWithUnit(rangeText, unit) {
  const rt = safeTrim(rangeText);
  const u = safeTrim(unit);
  if (!rt) return "—";
  if (!u) return rt;

  // if unit already present in range text, don't repeat
  const lower = rt.toLowerCase();
  if (lower.includes(u.toLowerCase())) return rt;

  return `${rt} ${u}`;
}

/* -------------------------------------------------------
   Fetch trend data: last 3 previous reports per test
   For each current test result, we fetch last 3 previous
   patientTestResult for same patient + same testId.
-------------------------------------------------------- */
async function buildTrendMap({ results, patientId }) {
  // Map key: `${testId}:${parameterId}` -> [{date, valueWithUnit}, ...]
  const trendMap = new Map();

  for (const r of results) {
    // Radiology HTML => no parameter trends
    if (isHtmlPresent(r.reportHtml)) continue;

    const testId = r.testId ?? r.test?.id;
    if (!testId) continue;

    // last 3 previous results of same test
    const previous = await prisma.patientTestResult.findMany({
      where: {
        patientId: Number(patientId),
        testId: Number(testId),
        // only previous to current record (fallback to id if createdAt missing)
        ...(r.createdAt
          ? { createdAt: { lt: r.createdAt } }
          : { id: { lt: r.id } }),
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

    // Build quick lookup per previous result: parameterId -> value text
    const prevByIndex = previous.map((prev) => {
      const perParam = new Map();
      for (const pr of prev.parameterResults || []) {
        const value = pr.valueNumber ?? pr.valueText ?? "—";
        const unit = pr.unit || pr.parameter?.unit || "";
        perParam.set(
          pr.parameterId,
          formatValueWithUnit(value, unit) // keep unit in trend value
        );
      }
      return {
        date: prev.createdAt || prev.updatedAt || null,
        perParam,
      };
    });

    // For each current parameter, store its 3 previous values
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

/* -----------------------------
   Build content HTML
   mode:
     - "standard" => old table (includes Unit column)
     - "full"     => NO Unit column + Trends (last 3 tests)
----------------------------- */
function buildPatientContentHtml({
  order,
  patient,
  results,
  layout,
  withLetterhead,
  mode = "standard",
  trendMap = null,
}) {
  const headerImg = withLetterhead ? layout?.headerImg : null;
  const footerImg = withLetterhead ? layout?.footerImg : null;

  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  const isFull = mode === "full";

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 18mm 15mm; }
        * { margin:0; padding:0; box-sizing:border-box; }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 9px;
          color: #2c3e50;
          line-height: 1.5;
        }

        .test-page {
          page-break-after: always;
          page-break-inside: avoid;
        }
        .test-page:last-child { page-break-after: auto; }

        .letterhead-header img { width:100%; display:block; margin-bottom: 8px; }
        .letterhead-footer img { width:100%; display:block; margin-top: 14px; }

        .header {
          text-align: center;
          border-bottom: 2px solid #4a90e2;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }
        .header h1 { font-size: 18px; font-weight: 600; margin-bottom: 3px; }
        .header h2 { font-size: 11px; font-weight: 400; color: #5a6c7d; }

        .patient-info {
          background: #f7f9fc;
          padding: 10px 12px;
          margin-bottom: 10px;
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
        .patient-info b { display:inline-block; min-width: 70px; font-weight: 600; }

        .test-title {
          background: linear-gradient(135deg, #4a90e2 0%, #5da8f5 100%);
          color: #fff;
          padding: 9px 12px;
          font-size: 10px;
          font-weight: 600;
          margin-bottom: 10px;
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
        thead tr.subhead th{
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

        .param-details {
          padding: 10px 12px;
          background: #fbfcfe;
          border-top: 1px dashed #e1e8ed;
          color: #2c3e50;
          font-size: 8.5px;
          line-height: 1.6;
        }
        .param-details .label {
          font-weight: 600;
          color: #34495e;
          margin-right: 6px;
        }
        .param-details .block { margin-top: 6px; }
        .param-details .htmlbox {
          margin-top: 4px;
          padding: 8px 10px;
          border: 1px solid #e6edf3;
          border-radius: 4px;
          background: #ffffff;
        }

        .radiology-html {
          font-size: 9px;
          line-height: 1.7;
          color: #2c3e50;
          padding: 12px;
          background: #fafbfc;
          border: 1px solid #e1e8ed;
          border-radius: 4px;
        }

        .footer-note {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid #e1e8ed;
          font-size: 7.5px;
          text-align: center;
          color: #95a5a6;
          line-height: 1.6;
        }
      </style>
    </head>

    <body>
      ${results
        .map((r, idx) => {
          const isRadiology = isHtmlPresent(r.reportHtml);

          // For FULL mode: build date headers for trend section (from first parameter we find)
          let trendDates = ["", "", ""];
          if (isFull && !isRadiology && trendMap && r.parameterResults?.length) {
            const testId = r.testId ?? r.test?.id;
            const firstParamId = r.parameterResults[0]?.parameterId;
            const arr = trendMap.get(`${testId}:${firstParamId}`) || [];
            trendDates = [
              formatShortDate(arr[0]?.date),
              formatShortDate(arr[1]?.date),
              formatShortDate(arr[2]?.date),
            ];
          }

          return `
            <div class="test-page">
              ${
                headerImg
                  ? `<div class="letterhead-header"><img src="${headerImg}" /></div>`
                  : ""
              }

              <div class="header">
                <h1>NOVUS HEALTH LABS</h1>
                <h2>Medical Diagnostic Report</h2>
              </div>

              <div class="patient-info">
                <div class="info-grid">
                  <div><b>Order ID:</b> ${order.orderNumber || order.id}</div>
                  <div><b>Date:</b> ${reportDate}</div>
                  <div><b>Name:</b> ${patient.fullName || "N/A"}</div>
                  <div><b>Age:</b> ${calculateAge(patient.dob)} years</div>
                  <div><b>Gender:</b> ${patient.gender || "N/A"}</div>
                  <div><b>Contact:</b> ${patient.contactNo || "N/A"}</div>
                </div>
              </div>

              <div class="test-title">${r.test?.name || "Test"}</div>

              ${
                isRadiology
                  ? `<div class="radiology-html">${r.reportHtml}</div>`
                  : isFull
                  ? `
                    <table>
                      <thead>
                        <tr>
                          <th style="width:34%">Test Name</th>
                          <th style="width:18%">Result, ${reportDate}</th>
                          <th style="width:20%">Bio Ref. Interval</th>
                          <th colspan="3" style="width:28%; text-align:center;">Trends (For last three tests)</th>
                        </tr>
                        <tr class="subhead">
                          <th></th>
                          <th></th>
                          <th></th>
                          <th style="text-align:center;">${trendDates[0] || "Date 1"}</th>
                          <th style="text-align:center;">${trendDates[1] || "Date 2"}</th>
                          <th style="text-align:center;">${trendDates[2] || "Date 3"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(r.parameterResults || [])
                          .map((pr) => {
                            const valueRaw = pr.valueNumber ?? pr.valueText ?? "—";
                            const unit = pr.unit || pr.parameter?.unit || "";

                            const valueCell = formatValueWithUnit(valueRaw, unit);
                            const rangeCell = formatRangeWithUnit(
                              pr.normalRangeText || pr.referenceText || "",
                              unit
                            );

                            const flagLower = safeTrim(pr.flag).toLowerCase();
                            let flagClass = "flag-normal";
                            if (flagLower.includes("critical")) flagClass = "flag-critical";
                            else if (flagLower.includes("high")) flagClass = "flag-high";
                            else if (flagLower.includes("low")) flagClass = "flag-low";

                            const testId = r.testId ?? r.test?.id;
                            const tArr = (trendMap && testId)
                              ? trendMap.get(`${testId}:${pr.parameterId}`) || []
                              : [];

                            const t1 = safeTrim(tArr[0]?.value);
                            const t2 = safeTrim(tArr[1]?.value);
                            const t3 = safeTrim(tArr[2]?.value);

                            // ✅ Flexible fields
                            const notesHtml =
                              pr.notesHtml ??
                              pr.notes ??
                              pr.parameter?.notesHtml ??
                              pr.parameter?.notes ??
                              "";

                            const normalValueHtml =
                              pr.normalValueDisplayHtml ??
                              pr.normalValueHtml ??
                              pr.parameter?.normalValueDisplayHtml ??
                              pr.parameter?.normalValueHtml ??
                              "";

                            const specialHtml =
                              pr.specialConditionsHtml ??
                              pr.specialHtml ??
                              pr.parameter?.specialConditionsHtml ??
                              pr.parameter?.specialHtml ??
                              "";

                            const hasDetails =
                              isHtmlPresent(notesHtml) ||
                              isHtmlPresent(normalValueHtml) ||
                              isHtmlPresent(specialHtml);

                            const mainRow = `
                              <tr>
                                <td>${pr.parameter?.name || "—"}</td>
                                <td>
                                  ${valueCell}
                                  <div style="margin-top:4px;"><span class="${flagClass}">${pr.flag || "NORMAL"}</span></div>
                                </td>
                                <td>${rangeCell}</td>
                                <td style="text-align:center;">${t1 || ""}</td>
                                <td style="text-align:center;">${t2 || ""}</td>
                                <td style="text-align:center;">${t3 || ""}</td>
                              </tr>
                            `;

                            const detailsRow = !hasDetails
                              ? ""
                              : `
                                <tr>
                                  <td colspan="6" class="param-details">
                                    ${
                                      isHtmlPresent(notesHtml)
                                        ? `<div class="block">
                                            <span class="label">Notes:</span>
                                            <div class="htmlbox">${notesHtml}</div>
                                          </div>`
                                        : ""
                                    }
                                    ${
                                      isHtmlPresent(normalValueHtml)
                                        ? `<div class="block">
                                            <span class="label">Normal Value Display:</span>
                                            <div class="htmlbox">${normalValueHtml}</div>
                                          </div>`
                                        : ""
                                    }
                                    ${
                                      isHtmlPresent(specialHtml)
                                        ? `<div class="block">
                                            <span class="label">Special Conditions:</span>
                                            <div class="htmlbox">${specialHtml}</div>
                                          </div>`
                                        : ""
                                    }
                                  </td>
                                </tr>
                              `;

                            return mainRow + detailsRow;
                          })
                          .join("")}
                      </tbody>
                    </table>
                  `
                  : `
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
                        ${(r.parameterResults || [])
                          .map((pr) => {
                            const value = pr.valueNumber ?? pr.valueText ?? "—";

                            const flagLower = safeTrim(pr.flag).toLowerCase();
                            let flagClass = "flag-normal";
                            if (flagLower.includes("critical")) flagClass = "flag-critical";
                            else if (flagLower.includes("high")) flagClass = "flag-high";
                            else if (flagLower.includes("low")) flagClass = "flag-low";

                            // ✅ Flexible fields
                            const notesHtml =
                              pr.notesHtml ??
                              pr.notes ??
                              pr.parameter?.notesHtml ??
                              pr.parameter?.notes ??
                              "";

                            const normalValueHtml =
                              pr.normalValueDisplayHtml ??
                              pr.normalValueHtml ??
                              pr.parameter?.normalValueDisplayHtml ??
                              pr.parameter?.normalValueHtml ??
                              "";

                            const specialHtml =
                              pr.specialConditionsHtml ??
                              pr.specialHtml ??
                              pr.parameter?.specialConditionsHtml ??
                              pr.parameter?.specialHtml ??
                              "";

                            const hasDetails =
                              isHtmlPresent(notesHtml) ||
                              isHtmlPresent(normalValueHtml) ||
                              isHtmlPresent(specialHtml);

                            const mainRow = `
                              <tr>
                                <td>${pr.parameter?.name || "—"}</td>
                                <td>${value}</td>
                                <td>${pr.unit || pr.parameter?.unit || "—"}</td>
                                <td>${pr.normalRangeText || pr.referenceText || "—"}</td>
                                <td><span class="${flagClass}">${pr.flag || "NORMAL"}</span></td>
                              </tr>
                            `;

                            const detailsRow = !hasDetails
                              ? ""
                              : `
                                <tr>
                                  <td colspan="5" class="param-details">
                                    ${
                                      isHtmlPresent(notesHtml)
                                        ? `<div class="block">
                                            <span class="label">Notes:</span>
                                            <div class="htmlbox">${notesHtml}</div>
                                          </div>`
                                        : ""
                                    }

                                    ${
                                      isHtmlPresent(normalValueHtml)
                                        ? `<div class="block">
                                            <span class="label">Normal Value Display:</span>
                                            <div class="htmlbox">${normalValueHtml}</div>
                                          </div>`
                                        : ""
                                    }

                                    ${
                                      isHtmlPresent(specialHtml)
                                        ? `<div class="block">
                                            <span class="label">Special Conditions:</span>
                                            <div class="htmlbox">${specialHtml}</div>
                                          </div>`
                                        : ""
                                    }
                                  </td>
                                </tr>
                              `;

                            return mainRow + detailsRow;
                          })
                          .join("")}
                      </tbody>
                    </table>
                  `
              }

              <div class="footer-note">
                <p><strong>Note:</strong> Please consult your physician.</p>
                <p>Page: ${idx + 1} / ${results.length}</p>
              </div>

            
            </div>
          `;
        })
        .join("")}
    </body>
  </html>
  `;
}

/* -----------------------------
   Cover / Last HTML
----------------------------- */
function buildFullImagePageHtml(imgUrl) {
  return `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin:0; padding:0; height:100%; }
        img { width:100%; height:100%; object-fit:cover; }
      </style>
    </head>
    <body>
      ${imgUrl ? `<img src="${imgUrl}" />` : ""}
    </body>
  </html>
  `;
}

/* =========================================================
   Generate 3 PDFs for ONE patient:
   - PLAIN
   - LETTERHEAD
   - FULL (cover + content(with letterhead + trends + no unit col) + last)
========================================================= */
export async function generatePatient3Pdfs({ orderId, patientId }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    select: { id: true, orderNumber: true },
  });
  if (!order) throw new Error("Order not found");

  const patient = await prisma.patient.findUnique({
    where: { id: Number(patientId) },
    select: { id: true, fullName: true, dob: true, gender: true, contactNo: true },
  });
  if (!patient) throw new Error("Patient not found");

  const layout = await prisma.reportLayout.findFirst({ orderBy: { id: "desc" } });

  const results = await prisma.patientTestResult.findMany({
    where: { orderId: Number(orderId), patientId: Number(patientId) },
    include: {
      test: true,
      parameterResults: {
        include: { parameter: true },
        orderBy: { parameterId: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  if (!results.length) throw new Error("No results for this patient");

  // ✅ Trend data only needed for FULL pdf
  const trendMap = await buildTrendMap({ results, patientId });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // 1) PLAIN (content only) - standard
  const plainHtml = buildPatientContentHtml({
    order,
    patient,
    results,
    layout,
    withLetterhead: false,
    mode: "standard",
  });
  const plainPdf = await renderPdfFromHtml(browser, plainHtml);

  // 2) LETTERHEAD (content only) - standard
  const letterHtml = buildPatientContentHtml({
    order,
    patient,
    results,
    layout,
    withLetterhead: true,
    mode: "standard",
  });
  const letterPdf = await renderPdfFromHtml(browser, letterHtml);

  // 3) FULL = cover + FULL mode content + last
  const coverImg = layout?.frontPageLastImg || null;
  const lastImg = layout?.lastPageImg || null;

  const coverPdf = coverImg
    ? await renderPdfFromHtml(browser, buildFullImagePageHtml(coverImg))
    : null;

  // ✅ FULL content: letterhead + NO unit column + trends
  const fullContentHtml = buildPatientContentHtml({
    order,
    patient,
    results,
    layout,
    withLetterhead: true,
    mode: "full",
    trendMap,
  });
  const fullContentPdf = await renderPdfFromHtml(browser, fullContentHtml);

  const lastPdf = lastImg
    ? await renderPdfFromHtml(browser, buildFullImagePageHtml(lastImg))
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

  await browser.close();

  return {
    plainBuffer: Buffer.from(plainPdf),
    letterheadBuffer: Buffer.from(letterPdf),
    fullBuffer: Buffer.from(await fullFinal.save()),
  };
}
