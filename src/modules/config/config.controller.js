import { ConfigService } from "./config.service.js";

const toFloat = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const ConfigController = {
  // -----------------------------
  // GLOBAL
  // -----------------------------
  getGlobalConfig: async (req, res) => {
    try {
      const config = await ConfigService.getGlobalConfig();
      return res.json({ success: true, data: config });
    } catch (err) {
      console.error("GET GLOBAL CONFIG ERROR:", err);
      return res.status(500).json({ error: "Failed to fetch configuration" });
    }
  },

  updateGlobalConfig: async (req, res) => {
    try {
      const payload = {
        baseAmount: toFloat(req.body.baseAmount),
        perKmRate: toFloat(req.body.perKmRate),
        thresholdDistance: toFloat(req.body.thresholdDistance),
        bonusForFiveStar: toFloat(req.body.bonusForFiveStar),
        // optional:
        // isActive: req.body.isActive ?? true
      };

      const updated = await ConfigService.updateGlobalConfig(payload);
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error("UPDATE GLOBAL CONFIG ERROR:", err);
      return res.status(500).json({ error: "Failed to update configuration" });
    }
  },

  // -----------------------------
  // VENDOR SPECIFIC
  // -----------------------------
  getVendorConfig: async (req, res) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!vendorId) return res.status(400).json({ error: "Valid vendorId required" });

      const config = await ConfigService.getVendorConfig(vendorId);
      return res.json({ success: true, data: config });
    } catch (err) {
      console.error("GET VENDOR CONFIG ERROR:", err);
      return res.status(500).json({ error: "Failed to fetch vendor configuration" });
    }
  },

  upsertVendorConfig: async (req, res) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!vendorId) return res.status(400).json({ error: "Valid vendorId required" });

      const payload = {
        baseAmount: toFloat(req.body.baseAmount),
        perKmRate: toFloat(req.body.perKmRate),
        thresholdDistance: toFloat(req.body.thresholdDistance),
        bonusForFiveStar: toFloat(req.body.bonusForFiveStar),
        isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
      };

      const updated = await ConfigService.upsertVendorConfig(vendorId, payload);
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error("UPSERT VENDOR CONFIG ERROR:", err);
      return res.status(500).json({ error: "Failed to update vendor configuration" });
    }
  },

  disableVendorConfig: async (req, res) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!vendorId) return res.status(400).json({ error: "Valid vendorId required" });

      const updated = await ConfigService.disableVendorConfig(vendorId);
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error("DISABLE VENDOR CONFIG ERROR:", err);
      return res.status(500).json({ error: "Failed to disable vendor configuration" });
    }
  },
};
