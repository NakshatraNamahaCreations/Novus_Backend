import { ResultService } from "./result.service.js";

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

  htmlReport: async (req, res) => {
    try {
      const report = await ResultService.fetchById(req.params.id);

      let rows = report.parameterResults
        .map(
          (x) => `
          <tr>
            <td>${x.parameterId}</td>
            <td>${x.valueNumber ?? x.valueText}</td>
            <td>${x.normalRangeText ?? ""}</td>
            <td>${x.flag ?? ""}</td>
          </tr>`
        )
        .join("");

      const html = `
        <html>
          <body>
            <h2>${report.test.name}</h2>
            <p>Patient: ${report.patient.fullName}</p>
            <table border="1" cellpadding="5">${rows}</table>
          </body>
        </html>`;

      res.set("Content-Type", "text/html");
      res.send(html);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate HTML" });
    }
  }
};
