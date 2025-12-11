import { Router } from "express";
import {
  createPincode,
  getPincodes,
  getPincodeById,
  updatePincode,
  deletePincode,
  searchPincodes,
} from "./pincode.controller.js";

const router = Router();

// Create
router.post("/", createPincode);

// Get all
router.get("/", getPincodes);

// Get single by ID
router.get("/:id", getPincodeById);

// Search by pincode or area
router.get("/search/:query", searchPincodes);

// Update
router.put("/:id", updatePincode);

// Delete
router.delete("/:id", deletePincode);

export default router;
