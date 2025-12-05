import express from "express";
import multer from "multer";
import {
  addSubCategory,
  getAllSubCategories,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory,
  getSubCategoriesByCategoryId
} from "./subcategory.controller.js";


// Use memory storage → buffer is available in req.file
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.post("/", upload.single("image"), addSubCategory);        // CREATE
router.get("/", getAllSubCategories);                           // READ ALL
router.get("/:id", getSubCategoryById);   
router.get("/category/:catId", getSubCategoriesByCategoryId);   // READ ONE
router.put("/:id", upload.single("image"), updateSubCategory);  // UPDATE
router.delete("/:id", deleteSubCategory);                       // DELETE

export default router;
