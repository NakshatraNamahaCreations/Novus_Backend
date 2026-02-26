import express from "express";
import {
  createCenter,
  getAllCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
  getNearbyCenters,
  assignCategoriesToCenter,
  createCenterSlot,
  getCenterSlots,
  updateCenterSlot,
  deleteCenterSlot,
  getAllCentersforadmin,
  getCenterCategories,
  getCenterCategoryCommissions,
  upsertCenterCategoryCommissions,

  upsertCenterSlotDayConfig,
  bulkUpsertCenterSlotDayConfig,
  getCenterSlotDayConfigs,
  deleteCenterSlotDayConfig,
  upsertCenterSlotDateOverride,
  bulkUpsertCenterSlotDateOverride,
  getCenterSlotDateOverrides,
  deleteCenterSlotDateOverride,
} from "./center.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();

router.get("/nearby", getNearbyCenters);

// CREATE
router.post("/", authenticateUser, createCenter);
router.post("/:id/categories", assignCategoriesToCenter);
router.get("/:id/categories", getCenterCategories);

router.post("/:id/slots", createCenterSlot);
router.get("/:id/slots", getCenterSlots);
router.put("/slot/:slotId", updateCenterSlot);
router.delete("/slot/:slotId", deleteCenterSlot);
// weekly config
router.post("/slot/:slotId/day-config", upsertCenterSlotDayConfig);
router.post("/slot/:slotId/day-config/bulk", bulkUpsertCenterSlotDayConfig);
router.get("/slot/:slotId/day-config", getCenterSlotDayConfigs);
router.delete("/slot/:slotId/day-config/:dayOfWeek", deleteCenterSlotDayConfig);

// date override
router.post("/slot/:slotId/date-override", upsertCenterSlotDateOverride);
router.post("/slot/:slotId/date-override/bulk", bulkUpsertCenterSlotDateOverride);
router.get("/slot/:slotId/date-override", getCenterSlotDateOverrides);
router.delete("/slot/:slotId/date-override/:date", deleteCenterSlotDateOverride);

// READ ALL
router.get("/", getAllCenters);
router.get("/admin", getAllCentersforadmin);
router.get("/:centerId/commissions", getCenterCategoryCommissions);
router.put("/:centerId/commissions", upsertCenterCategoryCommissions);

// READ ONE
router.get("/:id", getCenterById);

// UPDATE
router.put("/:id", updateCenter);

// DELETE
router.delete("/:id", deleteCenter);

export default router;
