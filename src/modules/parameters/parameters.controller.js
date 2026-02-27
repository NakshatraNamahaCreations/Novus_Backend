import { PrismaClient } from "@prisma/client";
import { ParameterService } from "./parameter.service.js";
import { ageToKeyFromDob } from "../../utils/ageToKeyFromDob.js";

const prisma = new PrismaClient();



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
      const patientId = req.query.patientId
        ? Number(req.query.patientId)
        : null;

      let gender = "Both";
      let ageKey = "any";

      // ✅ If patientId provided → derive gender + ageKey
      if (patientId && Number.isFinite(patientId)) {
        const patient = await prisma.patient.findUnique({
          where: { id: patientId }, // 🔥 change model name if needed
          select: { gender: true, dob: true },
        });

        if (patient) {
          gender = patient.gender || "Both";
          ageKey = ageToKeyFromDob(patient.dob);
        }
      }

      const allowedGender = new Set(["Male", "Female", "Both", "Kids"]);
      if (!allowedGender.has(gender)) {
        return res.status(400).json({
          success: false,
          error: "Invalid gender",
        });
      }

      console.log("ageKey---",ageKey)

      const list = await ParameterService.listByTest(
        testId,
        gender,
        ageKey
      );

      return res.json({
        success: true,
        data: list,
        meta: { gender, ageKey }, // helpful for debugging
      });
    } catch (err) {
      console.error("listByTest error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch parameters",
      });
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
