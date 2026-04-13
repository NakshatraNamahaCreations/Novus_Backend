import express from "express";
import {
  getCollectionReport,
  getRevenueReport,
  getPartnerSettlementReport,
  getPaymentGatewayReport,
  getWalkInReport,
  exportReport,
  getReportFilterData,
  getRefCenterStats,
  getDoctorStats,
} from "./reports.controller.js";

// Middleware: import your existing auth middleware
// import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// All report routes require authentication
// router.use(authenticate);

// ── Filter dropdown data ──────────────────────────────────────────────────────
router.get("/filter-data", getReportFilterData);

// ── Report endpoints ──────────────────────────────────────────────────────────
// GET /api/reports/collection?fromDate=2025-01-01&toDate=2025-01-31
router.get("/collection",         getCollectionReport);

// GET /api/reports/revenue?fromDate=...&toDate=...
router.get("/revenue",            getRevenueReport);

// GET /api/reports/partner-settlement?fromDate=...&toDate=...&centerId=...&settlementStatus=Pending
router.get("/partner-settlement", getPartnerSettlementReport);

// GET /api/reports/gateway?fromDate=...&toDate=...
router.get("/gateway",            getPaymentGatewayReport);

// GET /api/reports/walkin?fromDate=...&toDate=...&createdById=...
router.get("/walkin",             getWalkInReport);

// GET /api/reports/ref-center-stats?fromDate=...&toDate=...&createdById=...
router.get("/ref-center-stats",   getRefCenterStats);

// GET /api/reports/doctor-stats?fromDate=...&toDate=...&createdById=...
router.get("/doctor-stats",       getDoctorStats);

// ── CSV Export ────────────────────────────────────────────────────────────────
// GET /api/reports/export?type=collection&fromDate=...&toDate=...
// type: collection | revenue | partner-settlement | gateway | walkin
router.get("/export",             exportReport);

export default router;

/*
── Register in your main app.js / server.js ──────────────────────────────────

import reportRoutes from "./modules/reports/reports.routes.js";
app.use("/api/reports", reportRoutes);

*/