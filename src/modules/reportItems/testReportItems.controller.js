// ✅ CONTROLLER (UPDATED)
// testReportItems.controller.js

import { TestReportItemService } from "./testReportItems.service.js";

export const TestReportItemController = {
  listByTest: async (req, res) => {
    try {
      const { testId } = req.params;
      const rows = await TestReportItemService.listByTest(testId);
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error("listByTest report items error:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch report items" });
    }
  },

  // ✅ NEW: /full/:testId?gender=Male
  getFullByTest: async (req, res) => {
    try {
      const { testId } = req.params;
      const { gender } = req.query; // Male | Female | Both
      const data = await TestReportItemService.getFullByTest(testId, gender);
      return res.json({ success: true, data });
    } catch (err) {
      console.error("getFullByTest error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },

  create: async (req, res) => {
    try {
      const { testId } = req.params;
      const row = await TestReportItemService.create(testId, req.body);
      return res.json({ success: true, data: row });
    } catch (err) {
      console.error("create report item error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },

  update: async (req, res) => {
    try {
      const { itemId } = req.params;
      const row = await TestReportItemService.update(itemId, req.body);
      return res.json({ success: true, data: row });
    } catch (err) {
      console.error("update report item error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },

  remove: async (req, res) => {
    try {
      const { itemId } = req.params;
      await TestReportItemService.remove(itemId);
      return res.json({ success: true, message: "Report item deleted" });
    } catch (err) {
      console.error("delete report item error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },

  reorder: async (req, res) => {
    try {
      const { testId } = req.params;
      const { items } = req.body;
      const out = await TestReportItemService.reorder(testId, items);
      return res.json({ success: true, data: out });
    } catch (err) {
      console.error("reorder report items error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },
};
