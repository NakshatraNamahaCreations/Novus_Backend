// ✅ src/modules/results/results.controller.js
import { ResultService } from "./result.service.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ResultController = {
  create: async (req, res) => {
    try {
      const result = await ResultService.createResult(req.body);
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error("ResultController.create error:", err);
      return res.status(500).json({ success: false, error: "Failed to save test result" });
    }
  },

  getById: async (req, res) => {
    try {
      const result = await ResultService.fetchById(req.params.id);
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error("ResultController.getById error:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch test result" });
    }
  },

  find: async (req, res) => {
    try {
      const { orderId, testId, patientId } = req.query;

      if (!orderId || !testId || !patientId) {
        return res.status(400).json({
          success: false,
          message: "orderId, testId and patientId are required",
        });
      }

      const result = await ResultService.findByOrderTestAndPatient(
        Number(orderId),
        Number(testId),
        Number(patientId)
      );

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error("ResultController.find error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch result",
      });
    }
  },

  // ✅ patientReportPdf lookup (your existing)
  find1: async (req, res) => {
    try {
      const { orderId, patientId, type = "full" } = req.query;

      if (!orderId || !patientId) {
        return res.status(400).json({
          success: false,
          message: "orderId and patientId are required",
        });
      }

      const row = await prisma.patientReportPdf.findUnique({
        where: {
          orderId_patientId: {
            orderId: Number(orderId),
            patientId: Number(patientId),
          },
        },
      });

      if (!row) {
        return res.status(404).json({
          success: false,
          message: "Patient PDF not found (not generated yet)",
        });
      }

      const url =
        type === "plain"
          ? row.plainPdfUrl
          : type === "letterhead"
          ? row.letterheadPdfUrl
          : row.fullPdfUrl;

      if (!url) {
        return res.status(404).json({
          success: false,
          message: `PDF url not available for type=${type}`,
        });
      }

      return res.json({
        success: true,
        data: {
          orderId: row.orderId,
          patientId: row.patientId,
          type,
          url,
          status: row.status,
        },
      });
    } catch (err) {
      console.error("patientReportPdf.find error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch patient pdf url",
      });
    }
  },

  update: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = await ResultService.update(id, req.body);
      return res.json({ success: true, data });
    } catch (err) {
      console.error("ResultController.update error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

 getOrderReportsAllPatients: async (req, res) => {
  try {
    const { orderId } = req.params;
    const { testId } = req.query;

    const data = await ResultService.getOrderReportsAllPatients({
      orderId,
      testId,
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getOrderReportsAllPatients error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to fetch reports",
    });
  }
},

  getReportDataByTest: async (req, res) => {
    try {
      const testId = Number(req.params.testId);
      const patientTestResultId = Number(req.query.patientTestResultId);
      const gender = String(req.query.gender || "Both");

      if (!Number.isFinite(testId) || testId <= 0) {
        return res.status(400).json({ success: false, error: "Valid testId is required" });
      }
      if (!Number.isFinite(patientTestResultId) || patientTestResultId <= 0) {
        return res.status(400).json({ success: false, error: "Valid patientTestResultId is required" });
      }

      const data = await ResultService.getReportDataByTest({
        testId,
        patientTestResultId,
        gender,
      });

      return res.json({ success: true, data });
    } catch (err) {
      console.error("getReportDataByTest error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed" });
    }
  },
};
