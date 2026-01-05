import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* -----------------------------
   Helper: render HTML → PDF
----------------------------- */
async function renderPdfFromHtml(browser, html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await page.close();
  return pdf;
}

/* -----------------------------
   MAIN PDF GENERATOR
----------------------------- */
export const generateReportPDF = async (order) => {
  /* 1️⃣ Fetch layout */
  const layout = await prisma.reportLayout.findFirst({
    orderBy: { id: "desc" },
  });

  /* 2️⃣ Fetch results */
  const resultData = await prisma.patientTestResult.findMany({
    where: { orderId: Number(order?.id) },
    include: {
      test: true,
      parameterResults: {
        include: { parameter: true },
        orderBy: { parameterId: "asc" },
      },
    },
  });

  const coverImg = layout?.frontPageLastImg;
  const lastImg = layout?.lastPageImg;

  const browser = await puppeteer.launch({ headless: "new" });

  /* ================= COVER PAGE ================= */
  const coverHtml = `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin:0; padding:0; height:100%; }
        img { width:100%; height:100%; object-fit:cover; }
      </style>
    </head>
    <body>
      ${coverImg ? `<img src="${coverImg}" />` : ""}
    </body>
  </html>
  `;

  /* ================= CONTENT PAGE ================= */
  const contentHtml = `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 18mm 15mm; }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 9px;
          color: #2c3e50;
          line-height: 1.5;
        }

        /* ========== HEADER ========== */
        .header {
          text-align: center;
          border-bottom: 2px solid #4a90e2;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }

        .header h1 {
          font-size: 20px;
          color: #2c3e50;
          font-weight: 600;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .header h2 {
          font-size: 12px;
          font-weight: 400;
          color: #5a6c7d;
        }

        /* ========== PATIENT INFO ========== */
        .patient-info {
          background: #f7f9fc;
          padding: 12px 15px;
          margin-bottom: 20px;
          border-left: 3px solid #4a90e2;
          border-radius: 3px;
          font-size: 9px;
          line-height: 1.8;
        }

        .patient-info div {
          margin-bottom: 4px;
        }

        .patient-info div:last-child {
          margin-bottom: 0;
        }

        .patient-info b {
          display: inline-block;
          min-width: 90px;
          color: #2c3e50;
          font-weight: 600;
        }

        /* ========== TEST SECTION ========== */
        .test-section {
          margin-top: 25px;
          page-break-inside: avoid;
        }

        .test-section:first-of-type {
          margin-top: 0;
        }

        .test-title {
          background: linear-gradient(135deg, #4a90e2 0%, #5da8f5 100%);
          color: #ffffff;
          padding: 10px 14px;
          font-size: 10px;
          font-weight: 600;
          margin-bottom: 12px;
          border-radius: 4px;
          letter-spacing: 0.3px;
        }

        /* ========== PATHOLOGY TABLE ========== */
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 8.5px;
          border: 1px solid #e1e8ed;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        thead {
          background: #f0f4f8;
        }

        th {
          padding: 9px 10px;
          text-align: left;
          font-weight: 600;
          color: #2c3e50;
          text-transform: uppercase;
          font-size: 7.5px;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #d1dce5;
        }

        td {
          padding: 10px 10px;
          border-bottom: 1px solid #e9eff4;
          color: #4a5568;
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        tbody tr:nth-child(even) {
          background-color: #fafbfc;
        }

        tbody tr:hover {
          background-color: #f5f8fa;
        }

        /* Parameter name styling */
        td:first-child {
          font-weight: 600;
          color: #2c3e50;
        }

        /* Value column */
        td:nth-child(2) {
          font-weight: 500;
          font-size: 9px;
        }

        /* Status column */
        td:nth-child(5) {
          text-align: center;
        }

        /* ========== FLAGS ========== */
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

        /* ========== RADIOLOGY REPORT ========== */
        .radiology-html {
          font-size: 9px;
          line-height: 1.7;
          color: #2c3e50;
          padding: 15px;
          background: #fafbfc;
          border: 1px solid #e1e8ed;
          border-radius: 4px;
        }

        .radiology-html h1 {
          font-size: 13px;
          margin-top: 16px;
          margin-bottom: 8px;
          color: #2c3e50;
          font-weight: 600;
        }

        .radiology-html h2 {
          font-size: 11px;
          margin-top: 14px;
          margin-bottom: 6px;
          color: #34495e;
          font-weight: 600;
        }

        .radiology-html h3 {
          font-size: 10px;
          margin-top: 12px;
          margin-bottom: 5px;
          color: #4a5568;
          font-weight: 600;
        }

        .radiology-html p {
          margin-bottom: 8px;
        }

        .radiology-html ul, .radiology-html ol {
          margin-left: 18px;
          margin-bottom: 8px;
        }

        .radiology-html li {
          margin-bottom: 4px;
        }

        /* ========== FOOTER ========== */
        .footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px solid #e1e8ed;
          font-size: 7.5px;
          text-align: center;
          color: #95a5a6;
          line-height: 1.6;
        }

        .footer p {
          margin: 3px 0;
        }

        /* ========== COLUMN WIDTHS ========== */
        th:nth-child(1), td:nth-child(1) { width: 30%; }
        th:nth-child(2), td:nth-child(2) { width: 14%; }
        th:nth-child(3), td:nth-child(3) { width: 10%; }
        th:nth-child(4), td:nth-child(4) { width: 32%; }
        th:nth-child(5), td:nth-child(5) { width: 14%; }
      </style>
    </head>

    <body>

      <div class="header">
        <h1>NOVUS HEALTH LABS</h1>
        <h2>Medical Diagnostic Report</h2>
      </div>

      <div class="patient-info">
        <div><b>Patient Name:</b> ${order.patient.fullName}</div>
        <div><b>Order ID:</b> ${order.orderNumber || order.id}</div>
        <div><b>Report Date:</b> ${new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>

      ${resultData.map((r) => `
        <div class="test-section">

          <div class="test-title">${r.test.name}</div>

          ${
            r.reportHtml
              ? `
                <!-- ✅ RADIOLOGY REPORT -->
                <div class="radiology-html">
                  ${r.reportHtml}
                </div>
              `
              : `
                <!-- ✅ PATHOLOGY TABLE -->
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
                    ${r.parameterResults.map((pr) => {
                      const value = pr.valueNumber ?? pr.valueText ?? "—";
                      const flagClass =
                        pr.flag?.toLowerCase().includes("high") ||
                        pr.flag?.toLowerCase().includes("low") ||
                        pr.flag?.toLowerCase().includes("critical")
                          ? "flag-high"
                          : "flag-normal";

                      return `
                        <tr>
                          <td>${pr.parameter?.name || "—"}</td>
                          <td>${value}</td>
                          <td>${pr.unit || "—"}</td>
                          <td>${pr.normalRangeText || "—"}</td>
                          <td><span class="${flagClass}">${pr.flag || "NORMAL"}</span></td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              `
          }

        </div>
      `).join("")}

      <div class="footer">
        <p><strong>Note:</strong> These results should be correlated clinically. Please consult your physician.</p>
        <p>Report generated on ${new Date().toLocaleString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>

    </body>
  </html>
  `;

  /* ================= LAST PAGE ================= */
  const lastHtml = `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin:0; padding:0; height:100%; }
        img { width:100%; height:100%; object-fit:cover; }
      </style>
    </head>
    <body>
      ${lastImg ? `<img src="${lastImg}" />` : ""}
    </body>
  </html>
  `;

  /* ================= RENDER ================= */
  const coverPdf = await renderPdfFromHtml(browser, coverHtml);
  const contentPdf = await renderPdfFromHtml(browser, contentHtml);
  const lastPdf = await renderPdfFromHtml(browser, lastHtml);

  await browser.close();

  /* ================= MERGE ================= */
  const finalPdf = await PDFDocument.create();

  const merge = async (buf) => {
    const doc = await PDFDocument.load(buf);
    const pages = await finalPdf.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => finalPdf.addPage(p));
  };

  await merge(coverPdf);
  await merge(contentPdf);
  await merge(lastPdf);

  return Buffer.from(await finalPdf.save());
};