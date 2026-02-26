import express from "express";
import {
  // Slot CRUD
  createSlot,
  updateSlot,
  deleteSlot,
  getSlots,
  getSlotsByDate,
  getCapacityPreview,

  // Day config
  upsertDayConfig,
  bulkUpsertDayConfig,
  getDayConfigs,
  deleteDayConfig,

  // Date overrides
  upsertDateOverride,
  bulkUpsertDateOverride,
  getDateOverrides,
  deleteDateOverride,
} from "./slot.controller.js"; // <- adjust path

const router = express.Router();

/* ---------------------------------------------
   SLOT LIST + SPECIAL GET ROUTES (KEEP FIRST!)
--------------------------------------------- */

// GET /slots
router.get("/", getSlots);

// GET /slots/by-date?date=YYYY-MM-DD
router.get("/date", getSlotsByDate);

// GET /slots/capacity-preview?slotId=1&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/capacity-preview", getCapacityPreview);

/* ---------------------------------------------
   DAY-OF-WEEK CONFIG ROUTES
--------------------------------------------- */

// POST /slots/:id/day-config
router.post("/:id/day-config", upsertDayConfig);

// POST /slots/:id/day-config/bulk
router.post("/:id/day-config/bulk", bulkUpsertDayConfig);

// GET /slots/:id/day-config
router.get("/:id/day-config", getDayConfigs);

// DELETE /slots/:id/day-config/:dayOfWeek
router.delete("/:id/day-config/:dayOfWeek", deleteDayConfig);

/* ---------------------------------------------
   DATE OVERRIDE ROUTES
--------------------------------------------- */

// POST /slots/:id/date-override
router.post("/:id/date-override", upsertDateOverride);

// POST /slots/:id/date-override/bulk
router.post("/:id/date-override/bulk", bulkUpsertDateOverride);

// GET /slots/:id/date-override?upcoming=true
router.get("/:id/date-override", getDateOverrides);

// DELETE /slots/:id/date-override/:date   (YYYY-MM-DD)
router.delete("/:id/date-override/:date", deleteDateOverride);

/* ---------------------------------------------
   SLOT CRUD (KEEP LAST to avoid conflicts)
--------------------------------------------- */

// POST /slots
router.post("/", createSlot);

// PUT /slots/:id
router.put("/:id", updateSlot);

// DELETE /slots/:id
router.delete("/:id", deleteSlot);

export default router;