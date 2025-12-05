import express from "express";
import {
  createSlot,
  getSlots,
  getSlotsByDate,
   updateSlot,
  deleteSlot,
} from "./slot.controller.js";

const router = express.Router();

router.post("/", createSlot);          // Create slot
router.get("/", getSlots);             // Get all slots
router.get("/date", getSlotsByDate);   // Get slots date-wise
router.put("/:id", updateSlot);     // Update Slot
router.delete("/:id", deleteSlot);  // Delete Slot

export default router;
