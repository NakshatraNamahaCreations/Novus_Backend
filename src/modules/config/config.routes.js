import { Router } from "express";
import { ConfigController } from "./config.controller.js";

const router = Router();

// global config
router.get("", ConfigController.getGlobalConfig);
router.put("", ConfigController.updateGlobalConfig);

// vendor config
router.get("/vendor/:vendorId", ConfigController.getVendorConfig);
router.put("/vendor/:vendorId", ConfigController.upsertVendorConfig);
router.delete("/vendor/:vendorId", ConfigController.disableVendorConfig);

export default router;
