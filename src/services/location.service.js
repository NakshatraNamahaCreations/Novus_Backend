import redis from "../config/redis.js";

/**
 * Broadcast new order to nearby vendors.
 */
export async function broadcastNewOrder(io, order) {
  try {
  
    const { address } = order;
    if (!address) return;

    const orderId = order.id.toString();

    /* ---------------------------
       1️⃣  PINCODE BROADCAST
    --------------------------- */
    if (address.pincode) {
      // Get all vendors listening to that pincode
      const vendorRoom = io.sockets.adapter.rooms.get(`pin_${address.pincode}`);

      if (vendorRoom) {
        for (const socketId of vendorRoom) {
          const vendorId = await redis.get(`socketVendor:${socketId}`);

          // skip rejected vendors
          const rejected = await redis.sIsMember(
            `rejected:${orderId}`,
            vendorId
          );
          if (rejected) continue;

          io.to(socketId).emit("orderForPincode", order);
        }
      }
    }

    /* ---------------------------
       2️⃣  RADIUS BROADCAST (GEO)
    --------------------------- */
    if (
      typeof address.latitude === "number" &&
      typeof address.longitude === "number"
    ) {
      const RADIUS_KM = order.radiusKm || 5;
console.log(" slot: order.slot,",  order.slot,)


      const res = await redis.sendCommand([
        "GEORADIUS",
        "vendors:geo",
        String(address.longitude),
        String(address.latitude),
        String(RADIUS_KM),
        "km",
        "WITHDIST",
      ]);

      if (Array.isArray(res)) {
        for (const item of res) {
          const vendorId = item[0].toString();
          const distanceKm = parseFloat(item[1]);

          // ❌ skip rejected vendors
          const rejected = await redis.sIsMember(
            `rejected:${orderId}`,
            vendorId
          );
          if (rejected) continue;
          io.to(`vendor_${vendorId}`).emit("orderNearby", {
            
            orderId: order.id,
            pincode: order.address.pincode,
            latitude: order.address.latitude,
            longitude: order.address.longitude,
            slot: order.slot || "9:00 pM",
            date: order.date,
            testType: order.testType,
            distanceKm,
          });
        }
      }
    }
  } catch (err) {
    console.error("broadcastNewOrder error", err);
  }
}
