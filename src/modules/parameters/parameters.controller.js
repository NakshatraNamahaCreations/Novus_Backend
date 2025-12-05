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
      const list = await ParameterService.listByTest(testId);
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch parameters" });
    }
  }
};
