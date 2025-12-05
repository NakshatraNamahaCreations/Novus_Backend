import redis from "../config/redis.js";

/* -------------------------
   Utility: Safe Redis CMD wrapper (forces strings)
-------------------------- */
function r(...args) {
  return args.map(a => String(a));
}

export default function vendorSocket(io, socket) {

  /* -----------------------------
       VENDOR JOIN
  ------------------------------ */
  socket.on("vendorJoin", async ({ vendorId, pincode, latitude, longitude }) => {
    try {
      if (!vendorId) return;

      vendorId = String(vendorId);

      socket.join(`vendor_${vendorId}`);
      if (pincode) socket.join(`pin_${pincode}`);

      await redis.set(`socketVendor:${socket.id}`, vendorId);

      // Restore previous vendor metadata
      const prev = await redis.hGetAll(`vendor:${vendorId}`);

      const finalLat = latitude ?? prev.latitude ?? "";
      const finalLng = longitude ?? prev.longitude ?? "";

      // Restore GEO location
      if (finalLat && finalLng) {
        await redis.sendCommand(r(
          "GEOADD",
          "vendors:geo",
          finalLng,
          finalLat,
          vendorId
        ));
      }

      // Save vendor metadata
      await redis.hSet(`vendor:${vendorId}`, {
        vendorId,
        pincode: String(pincode || prev.pincode || ""),
        latitude: String(finalLat || ""),
        longitude: String(finalLng || ""),
        online: "true",
        updatedAt: String(Date.now())
      });

      console.log("✔ VENDOR JOINED:", vendorId);

      // Send pending jobs to this vendor
      await sendPendingOrdersToVendor(
        socket, vendorId, pincode, finalLat, finalLng
      );

    } catch (err) {
      console.error("vendorJoin error:", err);
    }
  });


  /* -----------------------------
      LOCATION UPDATE
  ------------------------------ */
  socket.on("locationUpdate", async ({ vendorId, latitude, longitude, pincode }) => {
    try {
      vendorId = String(vendorId);

      if (!vendorId || typeof latitude !== "number" || typeof longitude !== "number") return;

      await redis.sendCommand(r(
        "GEOADD",
        "vendors:geo",
        longitude,
        latitude,
        vendorId
      ));

      await redis.hSet(`vendor:${vendorId}`, {
        vendorId,
        pincode: String(pincode || (await redis.hGet(`vendor:${vendorId}`, "pincode"))),
        latitude: String(latitude),
        longitude: String(longitude),
        updatedAt: String(Date.now())
      });

      await redis.expire(`vendor:${vendorId}`, 120);

      await redis.set(`socketVendor:${socket.id}`, vendorId, {
        EX: 60 * 60 * 6,
      });

      io.to(`vendor_${vendorId}`).emit("vendorLive", {
        vendorId,
        latitude,
        longitude,
        pincode,
      });

    } catch (err) {
      console.error("locationUpdate error:", err);
    }
  });


  /* -----------------------------
      MANUAL REMOVE ORDER
  ------------------------------ */
  socket.on("removeOrder", ({ orderId }) => {
    socket.emit("removeOrderFromList", { orderId });
  });


  /* -----------------------------
      DISCONNECT
  ------------------------------ */
  socket.on("disconnect", async () => {
    try {
      const vendorId = await redis.get(`socketVendor:${socket.id}`);

      if (vendorId) {
        await redis.hSet(`vendor:${vendorId}`, {
          online: "false",
          lastSeen: String(Date.now())
        });
      }

      await redis.del(`socketVendor:${socket.id}`);

      console.log("❌ VENDOR DISCONNECTED:", vendorId);
    } catch (err) {
      console.error("disconnect error", err);
    }
  });

}



/* ------------------------------------------------------------
   🔥 SEND PENDING ORDERS TO VENDOR (on login/reconnect)
------------------------------------------------------------- */
async function sendPendingOrdersToVendor(socket, vendorId, pincode, latitude, longitude) {
  try {
    vendorId = String(vendorId);

    const orderKeys = await redis.keys("order:*");
    if (!orderKeys.length) return;

    for (const key of orderKeys) {
      const order = await redis.hGetAll(key);

      if (!order || order.status !== "pending") continue;

      /* ---------------------------
         FIX: Only show today's jobs
      ---------------------------- */
      if (!order.date) continue; // safety

      const orderDate = new Date(order.date);
      const today = new Date();

      const isToday =
        orderDate.getFullYear() === today.getFullYear() &&
        orderDate.getMonth() === today.getMonth() &&
        orderDate.getDate() === today.getDate();

      if (!isToday) continue;

      const orderId = order.orderId;

      /* 🚫 Skip if vendor rejected earlier */
      const rejected = await redis.sIsMember(`rejected:${orderId}`, vendorId);
      if (rejected) continue;

      /* 1️⃣ PINCODE MATCH */
      if (pincode && order.pincode === String(pincode)) {
        socket.emit("orderForPincode", {
  orderId: order.orderId,
  pincode: order.pincode,
  latitude: order.latitude,
  longitude: order.longitude,
  slot: order.slot,
  date: order.date,
  testType: order.testType
});

      }

      /* 2️⃣ RADIUS MATCH using GEO */
      if (latitude && longitude && order.latitude && order.longitude) {

        const res = await redis.sendCommand(r(
          "GEORADIUS",
          "vendors:geo",
          order.longitude,
          order.latitude,
          5,  // km
          "km",
          "WITHDIST"
        ));

        if (Array.isArray(res)) {
          for (const item of res) {
            if (String(item[0]) === vendorId) {
              const distanceKm = parseFloat(item[1]);
          socket.emit("orderNearby", {
  orderId: order.orderId,
  latitude: order.latitude,
  longitude: order.longitude,
  slot: order.slot,
  date: order.date,
  testType: order.testType,
  distanceKm
});

            }
          }
        }
      }
    }

  } catch (err) {
    console.error("sendPendingOrdersToVendor error:", err);
  }
}
