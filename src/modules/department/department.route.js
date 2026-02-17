import express from "express";
import {
  addDepartmentItem,
  getAllDepartmentItems,
  getDepartmentItemById,
  updateDepartmentItem,
  deleteDepartmentItem,
  getDepartmentItemsByType,
} from "./department.controller.js";

const router = express.Router();

// Create
router.post("/", addDepartmentItem);

// List with filters (type, isActive, limit, page, includeCategories)
router.get("/", getAllDepartmentItems);

// Quick filter endpoint (optional)
router.get("/type", getDepartmentItemsByType);

// Get one
router.get("/:id", getDepartmentItemById);

// Update
router.put("/:id", updateDepartmentItem);

// Delete
router.delete("/:id", deleteDepartmentItem);

export default router;
