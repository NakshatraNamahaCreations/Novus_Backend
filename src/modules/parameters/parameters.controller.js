import { ParameterService } from "./parameter.service.js";
const ageToKey = (ageStr) => {
  const s = String(ageStr ?? "").trim().toLowerCase();
  if (!s) return "any";

  // If frontend already sends key (like "1_year_to_2_years"), keep it
  const allowedKeys = new Set([
    "any",
    "newborn_upto_1_month",
    "1_month_to_1_year",
    "1_year_to_2_years",
    "2_years_to_10_years",
    "10_years_to_17_years",
  ]);
  if (allowedKeys.has(s)) return s;

  // Try number (years)
  const years = Number(s);
  if (!Number.isFinite(years) || years < 0) return "any";

  // Map years -> key
  if (years < 1 / 12) return "newborn_upto_1_month"; // < ~0.0833 years
  if (years < 1) return "1_month_to_1_year";
  if (years < 2) return "1_year_to_2_years";
  if (years < 10) return "2_years_to_10_years";
  if (years < 18) return "10_years_to_17_years";

  // Outside supported range
  return "any";
};
export const ParameterController = {
  addParameter: async (req, res) => {
    try {
      const { testId } = req.params;
      const parameter = await ParameterService.create(testId, req.body);
      res.json({ success: true, data: parameter });
    } catch (err) {
      console.error("Create Parameter Error:", err);
      res.status(500).json({ error: "Failed to create parameter" });
    }
  },

  updateParameter: async (req, res) => {
    try {
      const { parameterId } = req.params;
      const updated = await ParameterService.update(parameterId, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update parameter" });
    }
  },

  deleteParameter: async (req, res) => {
    try {
      const { parameterId } = req.params;
      await ParameterService.delete(parameterId);
      res.json({ success: true, message: "Parameter deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete parameter" });
    }
  },



listByTest: async (req, res) => {
  try {
    const { testId } = req.params;

    const gender = (req.query.gender || "Both").toString().trim();
    const ageKey = ageToKey(req.query.age || "any"); // ✅ convert here

    console.log("ageKey",ageKey)
    const allowedGender = new Set(["Male", "Female", "Both", "Kids"]);
    if (!allowedGender.has(gender)) {
      return res.status(400).json({
        success: false,
        error: "Invalid gender. Use Male, Female, Both, or Kids.",
      });
    }

    const list = await ParameterService.listByTest(testId, gender, ageKey);
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("listByTest error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch parameters" });
  }
},


   listByTest1: async (req, res) => {
   try {
    const { testId } = req.params;
  
    const list = await ParameterService.listByTest1(testId);

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("listByTest error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch parameters" });
  }
  },
  backfillReportItems: async (req, res) => {
  try {
    const { testId } = req.params;
    const out = await ParameterService.backfillReportItems(testId, req.body?.createdById);
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error("backfillReportItems error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Backfill failed" });
  }
},

};
