import { TestTemplateService } from "./testTemplate.service.js";

export const TestTemplateController = {
  ensureTemplate: async (req, res) => {
    try {
      const { testId } = req.params;
      const template = await TestTemplateService.ensureTemplate(testId, req.body);
      return res.json({ success: true, data: template });
    } catch (err) {
      console.error("ensureTemplate error:", err);
      return res.status(500).json({ success: false, error: "Failed to ensure template" });
    }
  },

  createBlock: async (req, res) => {
    try {
      const { testId } = req.params;
      const block = await TestTemplateService.createBlock(testId, req.body);
      return res.json({ success: true, data: block });
    } catch (err) {
      console.error("createBlock error:", err);
      return res.status(500).json({ success: false, error: "Failed to create block" });
    }
  },

  updateBlock: async (req, res) => {
    try {
      const { blockId } = req.params;
      const updated = await TestTemplateService.updateBlock(blockId, req.body);
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error("updateBlock error:", err);
      return res.status(500).json({ success: false, error: "Failed to update block" });
    }
  },

  deleteBlock: async (req, res) => {
    try {
      const { blockId } = req.params;
      await TestTemplateService.deleteBlock(blockId);
      return res.json({ success: true, message: "Block deleted" });
    } catch (err) {
      console.error("deleteBlock error:", err);
      return res.status(500).json({ success: false, error: "Failed to delete block" });
    }
  },

  listBlocksByTest: async (req, res) => {
    try {
      const { testId } = req.params;

      // UI dropdown => All/Male/Female/Other
      const genderScope = (req.query.genderScope || "ALL").toString().trim().toUpperCase();

      const allowed = new Set(["ALL", "MALE", "FEMALE", "OTHER"]);
      if (!allowed.has(genderScope)) {
        return res.status(400).json({
          success: false,
          error: "Invalid genderScope. Use ALL, MALE, FEMALE, OTHER",
        });
      }

      const list = await TestTemplateService.listBlocksByTest(testId, genderScope);
      return res.json({ success: true, data: list });
    } catch (err) {
      console.error("listBlocksByTest error:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch blocks" });
    }
  },

  reorderBlocks: async (req, res) => {
    try {
      const { testId } = req.params;
      const { items = [] } = req.body; // [{id, sortOrder}]
      await TestTemplateService.reorderBlocks(testId, items);
      return res.json({ success: true, message: "Reordered" });
    } catch (err) {
      console.error("reorderBlocks error:", err);
      return res.status(500).json({ success: false, error: "Failed to reorder blocks" });
    }
  },
};
