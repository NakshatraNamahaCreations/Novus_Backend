import { RangeService } from "./range.service.js";

export const RangeController = {
  addRange: async (req, res) => {
    try {
      const { parameterId } = req.params;
      const range = await RangeService.create(parameterId, req.body);
      res.json({ success: true, data: range });
    } catch (err) {
      res.status(500).json({ error: "Failed to create range" });
    }
  },

  updateRange: async (req, res) => {
    try {
      const { rangeId } = req.params;
      const updated = await RangeService.update(rangeId, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update range" });
    }
  },

  deleteRange: async (req, res) => {
    try {
      const { rangeId } = req.params;
      await RangeService.delete(rangeId);
      res.json({ success: true, message: "Range deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete range" });
    }
  },

  listRanges: async (req, res) => {
    try {
      const { parameterId } = req.params;
      const list = await RangeService.list(parameterId);
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch ranges" });
    }
  }
};
