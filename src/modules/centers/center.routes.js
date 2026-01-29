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
  getCenterCategories
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

// READ ALL
router.get("/", getAllCenters);
router.get("/admin", getAllCentersforadmin);

// READ ONE
router.get("/:id", getCenterById);

// UPDATE
router.put("/:id", updateCenter);

// DELETE
router.delete("/:id", deleteCenter);

export default router;
