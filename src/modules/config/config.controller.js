import { ConfigService } from "./config.service.js";

export const ConfigController = {
  getConfig: async (req, res) => {
    try {
      const config = await ConfigService.getConfig();
      res.json({ success: true, data: config });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  },

  updateConfig: async (req, res) => {
  try {
    const payload = {
      baseAmount: parseFloat(req.body.baseAmount),
      perKmRate: parseFloat(req.body.perKmRate),
      thresholdDistance: parseFloat(req.body.thresholdDistance),
      bonusForFiveStar: parseFloat(req.body.bonusForFiveStar),
    };

    const updated = await ConfigService.updateConfig(payload);
    res.json({ success: true, data: updated });

  } catch (err) {
    console.error("UPDATE CONFIG ERROR:", err);
    res.status(500).json({ error: "Failed to update configuration" });
  }
}


};
