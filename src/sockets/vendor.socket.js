// sockets/vendor.socket.js
import redis from "../config/redis.js";
import { istDateKey, orderKeys } from "../utils/orderRedis.js";

/* Safe Redis CMD wrapper (forces strings) */
function r(...args) {
  return args.map((a) => String(a));
}

export default function vendorSocket(io, socket) {
  /* -----------------------------
       VENDOR JOIN
  ------------------------------ */
  socket.on("vendorJoin", async ({ vendorId, pincode, latitude, longitude }) => {
    try {
      if (!vendorId) return;

      const vendorIdStr = String(vendorId);
      const pincodeStr = pincode ? String(pincode).trim() : "";

      socket.join(`vendor_${vendorIdStr}`);
      if (pincodeStr) socket.join(`pin_${pincodeStr}`);

      await redis.set(`socketVendor:${socket.id}`, vendorIdStr, { EX: 60 * 60 * 6 });

      // Restore previous vendor metadata
      const prev = await redis.hGetAll(`vendor:${vendorIdStr}`);

      const finalLat = latitude ?? (prev.latitude ? Number(prev.latitude) : null);
      const finalLng = longitude ?? (prev.longitude ? Number(prev.longitude) : null);

      // Restore GEO location for vendors
      if (Number.isFinite(finalLat) && Number.isFinite(finalLng)) {
        await redis.sendCommand(r("GEOADD", "vendors:geo", finalLng, finalLat, vendorIdStr));
      }

      // Save vendor metadata
      await redis.hSet(`vendor:${vendorIdStr}`, {
        vendorId: vendorIdStr,
        pincode: String(pincodeStr || prev.pincode || ""),
        latitude: String(Number.isFinite(finalLat) ? finalLat : ""),
        longitude: String(Number.isFinite(finalLng) ? finalLng : ""),
        online: "true",
        updatedAt: String(Date.now()),
      });
      await redis.expire(`vendor:${vendorIdStr}`, 60 * 60 * 6);

      console.log("✔ VENDOR JOINED:", vendorIdStr, pincodeStr);

      // Send only TODAY pending orders
      await sendTodaysPendingOrdersToVendor(socket, vendorIdStr, pincodeStr, finalLat, finalLng);
    } catch (err) {
      console.error("vendorJoin error:", err);
    }
  });

  /* -----------------------------
      LOCATION UPDATE
  ------------------------------ */
  socket.on("locationUpdate", async ({ vendorId, latitude, longitude, pincode }) => {
    try {
      const vendorIdStr = String(vendorId);
      if (!vendorIdStr) return;
      if (typeof latitude !== "number" || typeof longitude !== "number") return;

      const pincodeStr = pincode ? String(pincode).trim() : "";

      await redis.sendCommand(r("GEOADD", "vendors:geo", longitude, latitude, vendorIdStr));

      await redis.hSet(`vendor:${vendorIdStr}`, {
        vendorId: vendorIdStr,
        pincode: pincodeStr,
        latitude: String(latitude),
        longitude: String(longitude),
        updatedAt: String(Date.now()),
      });
      await redis.expire(`vendor:${vendorIdStr}`, 60 * 60 * 6);

      await redis.set(`socketVendor:${socket.id}`, vendorIdStr, { EX: 60 * 60 * 6 });

      io.to(`vendor_${vendorIdStr}`).emit("vendorLive", {
        vendorId: vendorIdStr,
        latitude,
        longitude,
        pincode: pincodeStr,
      });

      // Optional: re-push today's orders after location update
      await sendTodaysPendingOrdersToVendor(socket, vendorIdStr, pincodeStr, latitude, longitude);
    } catch (err) {
      console.error("locationUpdate error:", err);
    }
  });

  /* -----------------------------
      ACCEPT ORDER (removes from pending redis)
  ------------------------------ */
  socket.on("acceptOrder", async ({ vendorId, orderId }) => {
    try {
      const vendorIdStr = String(vendorId);
      const orderIdStr = String(orderId);
      if (!vendorIdStr || !orderIdStr) return;

      const orderHash = `order:${orderIdStr}`;
      const order = await redis.hGetAll(orderHash);
      if (!order || !Object.keys(order).length) return;

      if (order.status !== "pending") return;

      // Mark accepted
      await redis.hSet(orderHash, {
        status: "accepted",
        acceptedBy: vendorIdStr,
        acceptedAt: String(Date.now()),
      });

      // Remove from pending indexes
      const dateKey = order.dateKey || istDateKey(new Date(order.date));
      const pincodeStr = String(order.pincode || "").trim();
      const { pendingDateSet, pendingPincodeSet, orderGeo } = orderKeys({
        orderId: orderIdStr,
        dateKey,
        pincode: pincodeStr,
      });

      await redis.sRem(pendingDateSet, orderIdStr);
      if (pincodeStr) await redis.sRem(pendingPincodeSet, orderIdStr);
      await redis.sendCommand(["ZREM", orderGeo, orderIdStr]).catch(() => {});
      await redis.sendCommand(["SREM", orderGeo, orderIdStr]).catch(() => {});
      await redis.sendCommand(["ZREM", orderGeo, orderIdStr]).catch(() => {});
      // GEO is stored as a sorted set internally; use ZREM
      await redis.sendCommand(["ZREM", orderGeo, orderIdStr]).catch(() => {});

      // Tell others to remove from list
      io.emit("removeOrderFromList", { orderId: Number(orderIdStr) });
      io.to(`vendor_${vendorIdStr}`).emit("orderAccepted", { orderId: Number(orderIdStr) });
    } catch (err) {
      console.error("acceptOrder error:", err);
    }
  });

  /* -----------------------------
      REJECT ORDER (vendor-specific)
  ------------------------------ */
  socket.on("rejectOrder", async ({ vendorId, orderId }) => {
    try {
      const vendorIdStr = String(vendorId);
      const orderIdStr = String(orderId);
      if (!vendorIdStr || !orderIdStr) return;

      await redis.sAdd(`rejected:${orderIdStr}`, vendorIdStr);
      await redis.expire(`rejected:${orderIdStr}`, 60 * 60 * 48); // keep 2 days

      socket.emit("removeOrderFromList", { orderId: Number(orderIdStr) });
    } catch (err) {
      console.error("rejectOrder error:", err);
    }
  });

  /* -----------------------------
      MANUAL REMOVE ORDER (client local)
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
          lastSeen: String(Date.now()),
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
   ✅ SEND TODAY’S PENDING ORDERS TO VENDOR (pincode + geo)
------------------------------------------------------------- */
async function sendTodaysPendingOrdersToVendor(socket, vendorId, pincode, latitude, longitude) {
  try {
    const todayKey = istDateKey(new Date());

    // 1) PINCODE MATCH (today only)
    if (pincode) {
      const { pendingPincodeSet } = orderKeys({
        orderId: "0",
        dateKey: todayKey,
        pincode,
      });

      const ids = await redis.sMembers(pendingPincodeSet);

      for (const orderId of ids) {
        const rejected = await redis.sIsMember(`rejected:${orderId}`, vendorId);
        if (rejected) continue;

        const order = await redis.hGetAll(`order:${orderId}`);
        if (!order || !Object.keys(order).length) continue;
        if (order.status !== "pending") continue;

        socket.emit("orderForPincode", {
          orderId: Number(order.orderId),
          pincode: order.pincode,
          latitude: Number(order.latitude),
          longitude: Number(order.longitude),
          slot: order.slot || "",
          date: order.date,
          testType: order.testType,
          isReplay: true,
        });
      }
    }

    // 2) RADIUS MATCH (today geo index)
    if (typeof latitude === "number" && typeof longitude === "number") {
      const orderGeo = `orders:geo:date:${todayKey}`;

      // find orders near vendor (5km)
      const nearby = await redis.sendCommand(
        r("GEORADIUS", orderGeo, longitude, latitude, 5, "km", "WITHDIST")
      );

      if (Array.isArray(nearby)) {
        for (const item of nearby) {
          const orderId = String(item[0]);
          const distanceKm = parseFloat(item[1]);

          const rejected = await redis.sIsMember(`rejected:${orderId}`, vendorId);
          if (rejected) continue;

          const order = await redis.hGetAll(`order:${orderId}`);
          if (!order || !Object.keys(order).length) continue;
          if (order.status !== "pending") continue;

          socket.emit("orderNearby", {
            orderId: Number(order.orderId),
            latitude: Number(order.latitude),
            longitude: Number(order.longitude),
            slot: order.slot || "",
            date: order.date,
            testType: order.testType,
            distanceKm,
            isReplay: true,
          });
        }
      }
    }
  } catch (err) {
    console.error("sendTodaysPendingOrdersToVendor error:", err);
  }
}
