import express from "express";
import multer from "multer";
import {
  addTest,
  getAllTests,
  getTestById,
  updateTest,
  deleteTest,
  restoreTest,
  getTestsByCategory,
  getTestsBySubCategory,
  getTestsByTestType,
  searchTestsGrouped,
  getHomeMostBooked,
  getSpotlightTests,
  getAllTestsnames,
  searchTestsAndCheckups,
  bulkDiscount,
  bulkUploadTests,
  downloadBulkTemplate,
  exportTests
} from "./package.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Static / named routes FIRST (before any /:id) ───────────────────────────

router.get("/search", searchTestsGrouped);
router.get("/search/all", searchTestsAndCheckups);
router.get("/most-booked-tests", getHomeMostBooked);
router.get("/names", getAllTestsnames);
router.get("/spotlight", getSpotlightTests);

// ✅ Bulk routes — must be above /:id
router.get("/bulk-template", downloadBulkTemplate);
router.post("/bulk-upload", upload.single("file"), bulkUploadTests);
// routes — add with other static routes, BEFORE /:id
router.get("/export", exportTests);
// ─── Collection routes ────────────────────────────────────────────────────────

router.get("/", getAllTests);
router.post("/", upload.single("image"), authenticateUser, addTest);

router.put("/bulk-discount", authenticateUser, bulkDiscount);

// ─── Filter routes (also before /:id) ────────────────────────────────────────

router.get("/category/:categoryId", getTestsByCategory);
router.get("/subcategory/:subCategoryId", getTestsBySubCategory);
router.get("/testtype/:testType", getTestsByTestType);

// ─── Dynamic /:id routes LAST ─────────────────────────────────────────────────

router.post("/:id/restore", authenticateUser, restoreTest);
router.get("/:id", getTestById);
router.put("/:id", upload.single("image"), authenticateUser, updateTest);
// DELETE archives the test (soft delete). Hard delete only with ?force=true and zero references.
router.delete("/:id", authenticateUser, deleteTest);

export default router;