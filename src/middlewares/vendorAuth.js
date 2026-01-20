// src/middlewares/vendorAuth.js
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const vendorAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Token missing" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: "Invalid/expired token" });
    }

    // Expect token payload to include vendorId or id
    const vendorId = Number(payload.vendorId ?? payload.id);
    if (!vendorId) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, status: true, block: true },
    });

    if (!vendor) {
      return res.status(401).json({ success: false, message: "Vendor not found" });
    }

    if (vendor.block) {
      return res.status(403).json({ success: false, message: "Vendor blocked" });
    }

    // if you use status: "active"/"inactive"
    if (vendor.status && String(vendor.status).toLowerCase() !== "active") {
      return res.status(403).json({ success: false, message: "Vendor inactive" });
    }

    // Attach user context for controllers
    req.user = {
      id: vendor.id,
      vendorId: vendor.id,
      role: "VENDOR",
      tokenPayload: payload,
    };

    return next();
  } catch (err) {
    console.error("vendorAuth error:", err);
    return res.status(500).json({ success: false, message: "Auth failed" });
  }
};
