import { ResultService } from "./result.service.js";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ResultController = {
  create: async (req, res) => {
    try {
      const result = await ResultService.createResult(req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save test result" });
    }
  },

  getById: async (req, res) => {
    try {
      const result = await ResultService.fetchById(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch test result" });
    }
  },

  find: async (req, res) => {
  try {
    const { orderId, testId } = req.query;

    const result = await ResultService.findByOrderAndTest(
      Number(orderId),
      Number(testId)
    );

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch result" });
  }
},
 // UPDATE RESULT
  update: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = await ResultService.update(id, req.body);
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
print: async (req, res) => {
  try {
    const report = await ResultService.fetchById(req.params.id);

    if (!report) return res.status(404).send("Report not found");

    const html = ResultService.generatePrintableHtml(report);

    res.set("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to print report");
  }
},

download: async (req, res) => {
  try {
    const report = await ResultService.fetchById(req.params.id);

    if (!report) return res.status(404).send("Report not found");

    const html = ResultService.generatePrintableHtml(report);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=report-${report.id}.html`);
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to download report");
  }
},
 downloadPdf: async (req, res) => {
    try {
      const result = await ResultService.fetchById(req.params.id);
      if (!result) return res.status(404).send("Report not found");
    const withLetterhead = req.query.letterhead === "true";

    const layout = withLetterhead
      ? await ResultService.getDefaultLayout()
      : null;

      const defaultSignature = await prisma.eSignature.findFirst({
  where: { isDefault: true },
});

      // Generate the HTML using your existing service
      const html = ResultService.generatePrintableHtml(result, layout, defaultSignature);

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
       margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
      });

      await browser.close();

      // Send PDF to browser
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=report-${result.id}.pdf`,
      });

      res.send(pdfBuffer);

    } catch (err) {
      console.error(err);
      res.status(500).send("Failed to download PDF");
    }
  },
  

  htmlReport: async (req, res) => {
    try {
      const report = await ResultService.fetchById(req.params.id);

      // PATHOLOGY TABLE
      const rows = report.parameterResults
        .map(
          (x) => `
          <tr>
            <td>${x.parameterId}</td>
            <td>${x.valueNumber ?? x.valueText ?? ""}</td>
            <td>${x.normalRangeText ?? ""}</td>
            <td>${x.flag ?? ""}</td>
          </tr>`
        )
        .join("");

      const html = `
        <html>
          <body>
            <h2>${report.test.name}</h2>
            <p><b>Patient:</b> ${report.patient.fullName}</p>
            <hr/>
            <table border="1" cellpadding="6" cellspacing="0">
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Normal Range</th>
                <th>Flag</th>
              </tr>
              ${rows}
            </table>
          </body>
        </html>`;

      res.set("Content-Type", "text/html");
      res.send(html);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to generate HTML" });
    }
  },
};
