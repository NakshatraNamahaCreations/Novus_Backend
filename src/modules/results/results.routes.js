// ✅ src/modules/results/results.routes.js  (IMPORTANT route order fix)
import express from "express";
import { ResultController } from "./results.controller.js";

const router = express.Router();

router.post("/", ResultController.create);

router.get("/find", ResultController.find);
router.get("/find-result", ResultController.find1);

// ✅ STATIC ROUTE MUST COME BEFORE /:orderId/:patientId
router.get("/report-data/:testId", ResultController.getReportDataByTest);

router.put("/:id", ResultController.update);
router.get("/:id", ResultController.getById);

router.get("/orders/:orderId", ResultController.getOrderReportsAllPatients);

export default router;
