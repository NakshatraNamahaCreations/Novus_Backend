// modules/location/location.service.js
import redis from "../config/redis.js";

/**
 * ✅ PRODUCTION-SAFE BROADCAST (Pincode + Nearby but NOT cross-pincode)
 *
 * Rules:
 * 1) orderForPincode -> only vendors joined in pin_<orderPincode>
 * 2) orderNearby     -> only vendors within radius AND whose saved vendor.pincode == order.pincode
 *
 * So: vendor 560061 will NOT receive job of 560060 even if nearby.
 */
export async function broadcastNewOrder(io, order) {
  try {
    const { address } = order;
    if (!address) return;

    const orderIdStr = String(order.id);
    const orderPincode = String(address.pincode || "").trim();
    const lat = Number(address.latitude);
    const lng = Number(address.longitude);

    /* -------------------------------------------------------
       1) PINCODE ROOM BROADCAST (STRICT)
    -------------------------------------------------------- */
    if (orderPincode) {
      io.to(`pin_${orderPincode}`).emit("orderForPincode", {
        orderId: order.id,
        pincode: orderPincode,
        latitude: lat,
        longitude: lng,
        slot: order.slot || "",
        date: order.date,
        testType: order.testType,
        isReplay: false,
      });
    }

    /* -------------------------------------------------------
       2) RADIUS BROADCAST (NEARBY) BUT SAME PINCODE ONLY
    -------------------------------------------------------- */
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const RADIUS_KM = Number(order.radiusKm || 5);

      const res = await redis.sendCommand([
        "GEORADIUS",
        "vendors:geo",
        String(lng),
        String(lat),
        String(RADIUS_KM),
        "km",
        "WITHDIST",
      ]);

      if (Array.isArray(res)) {
        for (const item of res) {
          const vendorId = String(item[0]);
          const distanceKm = parseFloat(item[1]);

          // 🚫 skip rejected vendors for this order
          const rejected = await redis.sIsMember(`rejected:${orderIdStr}`, vendorId);
          if (rejected) continue;

          // ✅ FILTER: vendor must have SAME pincode as order
          const vendorPincode = await redis.hGet(`vendor:${vendorId}`, "pincode");
          if (String(vendorPincode || "").trim() !== orderPincode) continue;

          io.to(`vendor_${vendorId}`).emit("orderNearby", {
            orderId: order.id,
            pincode: orderPincode,
            latitude: lat,
            longitude: lng,
            slot: order.slot || "",
            date: order.date,
            testType: order.testType,
            distanceKm,
            isReplay: false,
          });
        }
      }
    }
  } catch (err) {
    console.error("broadcastNewOrder error", err);
  }
}
