import { Router } from "express";
import {
  createCity,
  getCities,
  getCityById,
  updateCity,
  deleteCity
} from "./city.controller.js";

const router = Router();

router.post("/", createCity);
router.get("/", getCities);
router.get("/:id", getCityById);
router.put("/:id", updateCity);
router.delete("/:id", deleteCity);

export default router;
