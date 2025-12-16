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
  downloadTemplate,
  bulkUpload,
  getCategoriesForTemplate,
  simpleBulkUpload,
  validateBulkUpload,
  getHomeMostBooked,
  getSpotlightTests
} from "./package.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CRUD
router.post("/", upload.single("image"), addTest);
router.get("/search", searchTestsGrouped);
router.get("/most-booked-tests", getHomeMostBooked);

router.get("/", getAllTests);
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

// Bulk upload routes
router.get('/template', downloadTemplate);
router.get('/categories-for-template', getCategoriesForTemplate);
router.post('/bulk-upload', upload1.single('file'), handleMulterError, bulkUpload);
router.post('/bulk-upload-simple', upload1.single('file'), handleMulterError, simpleBulkUpload);
router.post('/validate-bulk-upload', upload1.single('file'), handleMulterError, validateBulkUpload);

export default router;
