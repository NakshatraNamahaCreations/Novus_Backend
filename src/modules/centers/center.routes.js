import express from "express";
import {
  createCenter,
  getAllCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
  getNearbyCenters,

  assignCategoriesToCenter,
createCenterSlot,
getCenterSlots,
updateCenterSlot,
deleteCenterSlot
} from "./center.controller.js";

const router = express.Router();


router.get("/nearby", getNearbyCenters);

// CREATE
router.post("/", createCenter);
router.post("/:id/categories", assignCategoriesToCenter);
router.post("/:id/slots", createCenterSlot);
router.get("/:id/slots", getCenterSlots);

router.put("/slot/:slotId", updateCenterSlot);
router.delete("/slot/:slotId", deleteCenterSlot);





// READ ALL
router.get("/", getAllCenters);


// READ ONE
router.get("/:id", getCenterById);

// UPDATE
router.put("/:id", updateCenter);

// DELETE
router.delete("/:id", deleteCenter);

export default router;
