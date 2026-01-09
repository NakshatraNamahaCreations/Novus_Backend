import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ResultService = {
  // -------------------------------------------
  // FETCH BEST MATCHING RANGE
  // -------------------------------------------
  findRange: async (parameterId, patient) => {
    const ranges = await prisma.parameterRange.findMany({
      where: { parameterId },
      orderBy: { id: "asc" },
    });

    if (!ranges.length) return null;

    const gender = patient.gender?.toLowerCase();

    // Priority: gender match → any → first
    return (
      ranges.find((r) => r.gender?.toLowerCase() === gender) ||
      ranges.find((r) => !r.gender || r.gender === "any") ||
      ranges[0]
    );
  },
  update: async (id, payload) => {
    try {
      const existing = await prisma.patientTestResult.findUnique({
        where: { id },
      });

      if (!existing) throw new Error("Result not found");

      await prisma.patientTestResult.update({
        where: { id },
        data: {
          status: payload.approve ? "APPROVED" : "REPORTED",
          reportedById: payload.reportedById,
          createdById: payload.createdById,
          reportedAt: new Date(),
          notes:payload.notes,

          // ⭐ RADIOLOGY REPORT
          ...(payload.testType === "RADIOLOGY" && {
            reportHtml: payload.reportHtml,
            rawJson: payload.rawJson || null,
          }),
        },
      });

      // ⭐ PATHOLOGY PARAMETERS
      if (payload.testType === "PATHOLOGY" && payload.parameters?.length) {
        await prisma.parameterResult.deleteMany({
          where: { patientTestResultId: id },
        });

        const rows = payload.parameters.map((p) => ({
          patientTestResultId: id,
          parameterId: p.parameterId,
          valueNumber: p.valueNumber,
          valueText: p.valueText,
          unit: p.unit,
        }));

        await prisma.parameterResult.createMany({ data: rows });
      }

      return prisma.patientTestResult.findUnique({
        where: { id },
        include: { parameterResults: true },
      });
    } catch (err) {
      console.error("Update error:", err);
      throw err;
    }
  },

  findByOrderTestAndPatient: (orderId, testId, patientId) =>
    prisma.patientTestResult.findFirst({
      where: {
        orderId,
        testId,
        patientId,
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
        test: {
          select: {
            id: true,
            name: true,
            testType: true,
          },
        },
        parameterResults: {
          include: {
            parameter: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    }),

  // -------------------------------------------
  // FLAG EVALUATION (COLOR LOGIC)
  // -------------------------------------------
  evaluateFlag: (value, range) => {
    if (value === null || value === undefined || !range) return "NA";

    if (range.criticalLow != null && value < range.criticalLow)
      return "CRITICAL_LOW";

    if (range.lowerLimit != null && value < range.lowerLimit) return "LOW";

    if (range.criticalHigh != null && value > range.criticalHigh)
      return "CRITICAL_HIGH";

    if (range.upperLimit != null && value > range.upperLimit) return "HIGH";

    return "NORMAL";
  },

  // -------------------------------------------
  // CREATE TEST RESULT (PATHOLOGY + RADIOLOGY)
  // -------------------------------------------
  createResult: async (payload) => {
    const patient = await prisma.patient.findUnique({
      where: { id: payload.patientId },
    });

    if (!patient) throw new Error("Invalid patientId");

    const isRadiology = payload.testType === "RADIOLOGY";

    // 1️⃣ Create PatientTestResult
    const created = await prisma.patientTestResult.create({
      data: {
        patientId: payload.patientId,
        testId: payload.testId,
        orderId: payload.orderId,
        collectedAt: payload.collectedAt,
        reportedAt: new Date(),
        reportedById: payload.reportedById,
       notes:payload.notes,
        reportHtml: payload.reportHtml || null,
      },
    });

   
    // 2️⃣ If radiology, no parameters needed
    if (isRadiology) {
      return ResultService.fetchById(created.id);
    }

    // 3️⃣ PATHOLOGY PARAMETER PROCESSING
    const paramInsert = [];

    for (const p of payload.parameters) {
      const range = await ResultService.findRange(p.parameterId, patient);

      const flag =
        p.valueNumber != null
          ? ResultService.evaluateFlag(p.valueNumber, range)
          : "NA";

      paramInsert.push({
        patientTestResultId: created.id,
        parameterId: p.parameterId,
        valueNumber: p.valueNumber ?? null,
        valueText: p.valueText ?? null,
        unit: p.unit ?? null,
        flag,
        normalRangeText:
          range?.referenceRange ||
          `${range?.lowerLimit ?? "-"} - ${range?.upperLimit ?? "-"}`,
      });
    }

    if (paramInsert.length > 0) {
      await prisma.parameterResult.createMany({ data: paramInsert });
    }

    return ResultService.fetchById(created.id);
  },

  // -------------------------------------------
  // FETCH WITH children
  // -------------------------------------------
  fetchById: (id) =>
    prisma.patientTestResult.findUnique({
      where: { id: Number(id) },
      include: {
        patient: true,
        test: true,
        parameterResults: {
          include: {
            parameter: {
              select: {
                id: true,
                name: true, // 👈 GET PARAMETER NAME
              },
            },
          },
        },
      },
    }),
getDefaultLayout: () =>
  prisma.reportLayout.findFirst({
    orderBy: { id: "desc" }, // or createdAt: "desc"
  }),


  generatePrintableHtml: (report, layout = null, signature = null) => {
    const withLetterhead = !!layout;

    const isRadiology = !!report.reportHtml && report.reportHtml !== "";
    const isPathology = report.parameterResults?.length > 0;

    const today = new Date(report.reportedAt).toLocaleString();

    // Pathology rows
    const parameterRows = isPathology
      ? report.parameterResults
          .map(
            (p) => `
        <tr>
          <td>${p.parameter?.name || "–"}</td>
          <td>${p.valueNumber ?? p.valueText ?? "–"}</td>
          <td>${p.unit ?? ""}</td>
          <td>${p.normalRangeText ?? "–"}</td>
          <td><span class="flag ${p.flag?.toLowerCase()}">${
              p.flag || ""
            }</span></td>
        </tr>
      `
          )
          .join("")
      : "";

    // Header
    const headerHtml = withLetterhead
      ? `
      <div class="header-img-box">
        <img src="${layout.headerImg}" class="header-img" />
      </div>
    `
      : `
      <div class="header"></div>
    `;

    // Footer
    const footerHtml = withLetterhead
      ? `
      <div class="footer-img-box">
        <img src="${layout.footerImg}" class="footer-img" />
      </div>
    `
      : `
      <div class="footer">
        This is a computer-generated report. No signature is required.
      </div>
    `;

    // ⭐ SIGNATURE BLOCK
    const signatureHtml = signature
      ? `
      <div class="signature-area" style="text-align: right; margin-top: 50px;">
        <img src="${
          signature.signatureImg
        }" style="height: 80px; object-fit: contain;" />
        <p style="font-weight: bold; margin: 4px 0;">${signature.name}</p>
        <p style="margin: 2px 0;">${signature.qualification || ""}</p>
        <p style="margin: 2px 0;">${signature.designation || ""}</p>
      </div>
    `
      : `
      <div class="signature-area" style="text-align: right; margin-top: 50px;">
        <p><b>Reported By:</b> ${
          report.reportedById ? "Authorised Personnel" : "System"
        }</p>
        <p>__________________________</p>
      </div>
    `;

    return `
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Report - ${report.test.name}</title>

    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        color: #222;
      }

      html, body {
        background: white !important;
        width: 100% !important;
      }

   .page {
  padding: 24px 36px;
  max-width: 794px; /* A4 width */
  margin: 0 auto;
}
.header-img-box {
  margin-bottom: 16px;
}
.footer-img-box {
  margin-top: 40px;
}


      .header-img-box, .footer-img-box {
        overflow: hidden;
        width: 100%;
        text-align: center;
      }

      .header-img {
        width: 100%;
        display: block;
      }

      .footer-img {
        width: 100%;
        display: block;
      }

      .header {
        display: flex;
        justify-content: space-between;
        border-bottom: 2px solid #1e40af;
        padding-bottom: 12px;
        margin-bottom: 20px;
      }

    .patient-box {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  padding: 16px 18px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.patient-box h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #1e3a8a;
}


      .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px 20px;
        font-size: 13px;
      }

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e3a8a;
  margin: 28px 0 10px;
  padding-left: 10px;
  border-left: 4px solid #1e40af;
}


      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }

      th {
        background: #1e3a8a;
        color: white;
        text-align: left;
        padding: 8px;
        font-size: 13px;
      }

      td {
        padding: 8px;
        border-bottom: 1px solid #e5e7eb;
        font-size: 13px;
      }

      .flag.normal { color: #16a34a; font-weight: bold; }
      .flag.high { color: #dc2626; font-weight: bold; }
      .flag.low { color: #ca8a04; font-weight: bold; }
      .flag.critical_high { color: #b91c1c; font-weight: bold; }
      .flag.critical_low { color: #b45309; font-weight: bold; }
      .flag.na { color: #6b7280; }

      .radiology-box {
        padding: 15px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #f9fafb;
        margin-top: 12px;
        font-size: 14px;
        line-height: 1.5;
      }

      .footer {
        text-align: center;
        font-size: 11px;
        color: #6b7280;
        margin-top: 40px;
        padding-top: 10px;
        border-top: 1px solid #d1d5db;
      }
    </style>
  </head>

  <body>
    <div class="page">

      ${headerHtml}

      <div class="patient-box">
        <h3>Patient Information</h3>
        <div class="info-grid">
          <div><b>Name:</b> ${report.patient.fullName}</div>
          <div><b>Test:</b> ${report.test.name}</div>
          <div><b>Reported At:</b> ${today}</div>
          <div><b>Patient ID:</b> ${report.patientId}</div>
        </div>
      </div>

      ${
        isPathology
          ? `
      <div class="section-title">Pathology Results</div>

      <table>
        <tr>
          <th>Parameter</th>
          <th>Value</th>
          <th>Unit</th>
          <th>Normal Range</th>
          <th>Flag</th>
        </tr>
        ${parameterRows}
      </table>
      `
          : ""
      }

      ${
        isRadiology
          ? `
      <div class="section-title">Radiology Report</div>
      <div class="radiology-box">${report.reportHtml}</div>
      `
          : ""
      }

      <!-- SIGNATURE -->
      ${signatureHtml}

      ${footerHtml}

    </div>
  </body>
  </html>
  `;
  },
};
