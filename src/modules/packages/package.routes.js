import express from "express";
import multer from "multer";
import {
  addTest,
  getAllTests,
  getTestById,
  updateTest,
  deleteTest,
  getTestsByCategory,
  getTestsBySubCategory,
  getTestsByTestType,
  searchTestsGrouped
} from "./package.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CRUD
router.post("/", upload.single("image"), addTest);
router.get("/search", searchTestsGrouped);
router.get("/", getAllTests);
router.get("/:id", getTestById);
router.put("/:id", upload.single("image"), updateTest);
router.delete("/:id", deleteTest);

// Filters
router.get("/category/:categoryId", getTestsByCategory);
router.get("/subcategory/:subCategoryId", getTestsBySubCategory);
router.get("/testtype/:testType", getTestsByTestType);

export default router;
