import { OptionService } from "./option.service.js";

export const OptionController = {
  add: async (req, res) => {
    try {
      const { parameterId } = req.params;
      const data = await OptionService.create(parameterId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: "Failed to add option" });
    }
  },

  list: async (req, res) => {
    try {
      const { parameterId } = req.params;
      const list = await OptionService.list(parameterId);
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch options" });
    }
  },

  delete: async (req, res) => {
    try {
      const { optionId } = req.params;
      await OptionService.delete(optionId);
      res.json({ success: true, message: "Option deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete option" });
    }
  }
};
