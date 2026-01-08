import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "NOVUS!@2025";

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export const registerVendorSocketHandlers = (io, socket) => {

  /* -------------------- AUTH -------------------- */
  const token =
    socket.handshake.query?.token ?? socket.handshake.auth?.token;

  const payload = token ? verifyToken(token) : null;

  if (payload?.role === "vendor") {
    socket.data.vendorId = payload.userId;
    console.log("Vendor connected:", payload.userId);
  }

  /* --------------- VENDOR JOIN PINCODE ROOM --------------- */
  socket.on("vendor:register", async ({ vendorId }) => {
    if (!vendorId) return;

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) return;

    const room = `PIN_${vendor.pincode}`;
    socket.join(room);

    console.log(`Vendor ${vendorId} joined room ${room}`);
  });

  /* -------------------- ORDER ACCEPT -------------------- */
  socket.on("order:accept", async ({ vendorId, orderId }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { address: true }
      });

      if (!order) return;

      // If already accepted by another vendor
      if (order.vendorId) {
        return socket.emit("order:accept:failed", {
          orderId,
          message: "Order already accepted by another vendor",
        });
      }

      // Accept order
      await prisma.order.update({
        where: { id: orderId },
        data: {
          vendorId,
          status: "accepted",
        },
      });

      socket.emit("order:accept:success", { orderId });

      // notify all other vendors in the SAME PINCODE room
      const room = `PIN_${order.address.pincode}`;

      socket.to(room).emit("order:taken", {
        orderId,
        vendorId
      });

    } catch (err) {
      console.error("Accept error:", err);
    }
  });

  /* -------------------- ORDER REJECT -------------------- */
  socket.on("order:reject", async ({ vendorId, orderId, reason }) => {
    try {
      // STORE REJECTION ONLY — DO NOT UPDATE ORDER STATUS
      await prisma.vendorOrderRejection.create({
        data: {
          vendorId,
          orderId,
          reason,
        },
      });

      socket.emit("order:reject:success", {
        orderId,
        message: "Rejection submitted",
      });

    } catch (err) {
      console.error("Reject error:", err);
    }
  });

  /* -------------------- VENDOR LOCATION -------------------- */
  socket.on("vendor:location:update", async (loc) => {
    try {
      const {
        vendorId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        orderId,
      } = loc ?? {};

      if (!vendorId || typeof latitude !== "number" || typeof longitude !== "number")
        return;

      io.to(`vendor_${vendorId}`).emit("vendor:live:location", {
        vendorId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        orderId,
        recordedAt: new Date().toISOString(),
      });

      await prisma.vendorCurrentLocation.upsert({
        where: { vendorId },
        update: { latitude, longitude, accuracy, speed, heading },
        create: { vendorId, latitude, longitude, accuracy, speed, heading },
      });

      if (orderId) {
        await prisma.vendorLocationHistory.create({
          data: { vendorId, latitude, longitude, accuracy, speed, heading },
        });
      }
    } catch (err) {
      console.error("vendor:location:update error", err);
    }
  });

  /* -------------------- DISCONNECT -------------------- */
  socket.on("disconnect", () => {
    console.log("Vendor socket disconnected", socket.id);
  });
};
