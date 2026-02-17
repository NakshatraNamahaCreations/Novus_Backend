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
  searchTestsGrouped,

  getHomeMostBooked,
  getSpotlightTests,
  getAllTestsnames,
  searchTestsAndCheckups,
  bulkDiscount
} from "./package.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CRUD
router.post("/", upload.single("image"),authenticateUser, addTest);
router.get("/search", searchTestsGrouped);
router.get("/search/all", searchTestsAndCheckups);
router.get("/most-booked-tests", getHomeMostBooked);

router.get("/", getAllTests);

// routes/tests.routes.js
router.put("/bulk-discount", bulkDiscount);


router.get("/names", getAllTestsnames);
router.get("/spotlight", getSpotlightTests);

router.get("/:id", getTestById);
router.put("/:id", upload.single("image"), updateTest);
router.delete("/:id", deleteTest);

// Filters
router.get("/category/:categoryId", getTestsByCategory);
router.get("/subcategory/:subCategoryId", getTestsBySubCategory);
router.get("/testtype/:testType", getTestsByTestType);

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload1 = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB'
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  next();
};


export default router;
