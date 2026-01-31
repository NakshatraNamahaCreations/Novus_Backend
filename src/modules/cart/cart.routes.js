import { Router } from "express";
import {
  addToCart,
  getCart,
  removeCartItem,
  clearCart,
  checkoutCart,
  deleteCartCompletely,
  deleteAllItemsByPatient,
  updateMemberSelection,
  getAllCarts,
  updateCartAdminRemark
} from "./cart.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = Router();

// 🛒 Add item
router.post("/add", addToCart);
router.get("/", getAllCarts);
router.put("/member/select", updateMemberSelection);

// ✅ NEW ADMIN REMARK
router.patch("/admin/:cartId/remark", authenticateUser, updateCartAdminRemark);


// 🛒 Get cart
router.get("/:patientId", getCart);

// ❌ Remove one item
router.post("/remove", removeCartItem);

// ❌ Clear cart (remove all items & reset)
router.post("/clear", clearCart);

// 🧾 Checkout
router.post("/checkout", checkoutCart);

router.delete("/items/:userId/:patientId", deleteAllItemsByPatient);


// 🔥 Delete entire cart (cart + items)
router.delete("/cart/:patientId", deleteCartCompletely);

export default router;
