import express from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  changePassword,
  changePassword1,
  getCurrentUser,
  updateCurrentUser
} from "./user.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();

// LOGIN
router.post("/login", loginUser);

// LOGOUT
router.post("/logout", authenticateUser,logoutUser);

// CREATE
router.post("/create", createUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", changePassword); 
router.post("/change-password1",authenticateUser, changePassword1); 

router.get("/me", authenticateUser, getCurrentUser);
router.put("/me", authenticateUser, updateCurrentUser);



// READ ALL
router.get("/", getAllUsers);

// READ ONE
router.get("/:id", getUserById);

// UPDATE
router.put("/:id", updateUser);

// DELETE
router.delete("/:id", deleteUser);

export default router;
