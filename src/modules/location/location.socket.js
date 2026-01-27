import locationService from "./location.service.js";

export default function locationSocket(io, socket) {
  console.log("Location socket active for:", socket.id);

  /* -----------------------------
     JOIN ROOM (order specific)
  ------------------------------ */
  socket.on("joinOrderRoom", ({ orderId }) => {
    socket.join(`order_${orderId}`);
    socket.emit("joined", { room: `order_${orderId}` });
  });

  /* -----------------------------
     START TRACKING
  ------------------------------ */
  socket.on("startLocationSharing", async (data) => {
    const { orderId, vendorId, userLatitude, userLongitude } = data;

    try {
      await locationService.startOrderTracking(
        orderId,
        vendorId,
        userLatitude,
        userLongitude,
      );

      socket.join(`order_${orderId}`);

      io.to(`order_${orderId}`).emit("trackingStarted", {
        orderId,
        vendorId,
      });

      // ✅ Also emit status (example)
      io.to(`order_${orderId}`).emit("orderStatusUpdate", {
        orderId,
        status: "tracking_started",
        updatedAt: Date.now(),
        by: { vendorId },
      });

      // optional cache
      // await redis.hSet(`order:${orderId}`, { status: "tracking_started" });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  /* -----------------------------
     LOCATION UPDATE
  ------------------------------ */
  socket.on("vendorLocationUpdate", async (data) => {
    const { vendorId, latitude, longitude, orderId } = data;

    try {
      if (!orderId) return;

      const metrics = await locationService.updateVendorLocation(
        Number(vendorId),
        Number(latitude),
        Number(longitude),
        Number(orderId),
      );

      io.to(`order_${orderId}`).emit("vendorLocationUpdateForUser", {
        orderId: Number(orderId),
        vendorId: Number(vendorId),
        vendorLocation: {
          latitude: Number(latitude),
          longitude: Number(longitude),
        },
        metrics, // may be null if throttled
        updatedAt: Date.now(),
      });
      
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  /* -----------------------------
     ✅ NEW: ORDER STATUS UPDATE
     Vendor (or admin) can emit:
     { orderId, vendorId, status }
  ------------------------------ */
  socket.on("orderStatusChange", async (data) => {
    const { orderId, vendorId, status, note } = data;

    try {
      if (!orderId || !status) return;

      // ✅ 1) Update DB (optional but recommended)
      // If you already have an API for status update, you can remove DB update here.
      // await prisma.order.update({ where: { id: Number(orderId) }, data: { status } });

      // ✅ 2) Cache (optional)
      // await redis.hSet(`order:${orderId}`, { status: String(status), updatedAt: String(Date.now()) });

      // ✅ 3) Broadcast to everyone watching this order
      io.to(`order_${orderId}`).emit("orderStatusUpdate", {
        orderId,
        status,
        note: note || "",
        updatedAt: Date.now(),
        by: { vendorId: vendorId ? Number(vendorId) : null },
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });
}

/* ---------------------------------------------------------
   ✅ OPTIONAL: export a helper so your REST APIs can emit status too
   Example usage in acceptOrderByVendor:
   emitOrderStatus(io, orderId, "accepted", vendorId)
---------------------------------------------------------- */
export function emitOrderStatus(
  io,
  orderId,
  status,
  vendorId = null,
  note = "",
) {
  io.to(`order_${orderId}`).emit("orderStatusUpdate", {
    orderId,
    status,
    note,
    updatedAt: Date.now(),
    by: { vendorId: vendorId ? Number(vendorId) : null },
  });
}
