import express from "express";
import multer from "multer";
import {
  addBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  deleteBanner,
  getBannersBySubCategory,
} from "./banner.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CRUD
router.post("/", upload.single("image"), addBanner);        // CREATE
router.get("/", getAllBanners);                             // READ ALL
router.get("/:id", getBannerById);                          // READ ONE
router.put("/:id", upload.single("image"), updateBanner);   // UPDATE
router.delete("/:id", deleteBanner);                        // DELETE

// Filter
router.get("/subcategory/:subCategoryId", getBannersBySubCategory);

export default router;
