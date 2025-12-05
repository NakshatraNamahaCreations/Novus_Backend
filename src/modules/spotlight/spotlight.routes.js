import express from "express";
import multer from "multer";
import {
  addSpotlightBanner,
  getAllSpotlightBanners,
  getSpotlightBannerById,
  updateSpotlightBanner,
  deleteSpotlightBanner,
  getSpotlightBannersBySubCategory,
} from "./spotlight.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CRUD
router.post("/", upload.single("image"), addSpotlightBanner);        // CREATE
router.get("/", getAllSpotlightBanners);                             // READ ALL
router.get("/:id", getSpotlightBannerById);                          // READ ONE
router.put("/:id", upload.single("image"), updateSpotlightBanner);   // UPDATE
router.delete("/:id", deleteSpotlightBanner);                        // DELETE

// Filter
router.get("/subcategory/:subCategoryId", getSpotlightBannersBySubCategory);

export default router;
