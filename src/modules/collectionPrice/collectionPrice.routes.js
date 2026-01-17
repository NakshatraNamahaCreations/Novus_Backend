import express from "express";
import {
  createCollectionPrice,
  getCollectionPrices,
  getCollectionPriceById,
  updateCollectionPrice,
  deleteCollectionPrice,
  resolveCollectionPrice,
} from "./collectionPrice.controller.js";

// If you have auth middleware, apply it here:
// import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Resolve must come BEFORE :id route
router.get("/resolve", resolveCollectionPrice);

router.post("/", /* requireAuth, */ createCollectionPrice);
router.get("/", getCollectionPrices);
router.get("/:id", getCollectionPriceById);
router.put("/:id", /* requireAuth, */ updateCollectionPrice);
router.delete("/:id", /* requireAuth, */ deleteCollectionPrice);

export default router;
