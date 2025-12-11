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
