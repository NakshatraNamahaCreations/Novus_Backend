import { ParameterService } from "./parameter.service.js";

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

  
    // Optional validation (recommended)
    const allowed = new Set(["Male", "Female", "Both" ,"Kids"]);
    if (!allowed.has(gender)) {
      return res.status(400).json({
        success: false,
        error: "Invalid gender. Use Male, Female, or Both.",
      });
    }

    const list = await ParameterService.listByTest(testId, gender);

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
  }
};
