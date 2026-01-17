// sockets/order.socket.js
import redis from "../config/redis.js";
import { istDateKey, orderKeys } from "../utils/orderRedis.js";

export default function orderSocket(io, socket) {
  socket.on("ping", (msg) => socket.emit("pong", msg));

  // This event name is fine. But it must read from DATE+PINCODE index.
  socket.on("vendorOnline", async ({ vendorId, pincode }) => {
    try {
      if (!vendorId || !pincode) return;

      const vendorIdStr = String(vendorId);
      const pincodeStr = String(pincode).trim();

      // ✅ leave ALL previous pin_ rooms (otherwise you'll receive multiple pincodes)
      for (const room of socket.rooms) {
     
        if (room.startsWith("pin_")) socket.leave(room);
      }

      socket.join(`vendor_${vendorIdStr}`);
      socket.join(`pin_${pincodeStr}`);

      const todayKey = istDateKey(new Date());
      const { pendingPincodeSet } = orderKeys({
        orderId: "0",
        dateKey: todayKey,
        pincode: pincodeStr,
      });

      const pendingOrderIds = await redis.sMembers(pendingPincodeSet);

      for (const orderId of pendingOrderIds) {
        const rejected = await redis.sIsMember(`rejected:${orderId}`, vendorIdStr);
        if (rejected) continue;

        const orderData = await redis.hGetAll(`order:${orderId}`);
        if (!orderData || !Object.keys(orderData).length) continue;
        if (orderData.status !== "pending") continue;

        // ✅ HARD FILTER: do not send past/future date jobs
        if (orderData.dateKey !== todayKey) continue;

        socket.emit("orderForPincode", {
          orderId: Number(orderData.orderId),
          slotId: orderData.slotId,
          slot: orderData.slot || "",
          date: orderData.date,
          status: orderData.status,
          testType: orderData.testType,
          pincode: orderData.pincode,
          latitude: Number(orderData.latitude),
          longitude: Number(orderData.longitude),
          isReplay: true,
        });
      }
    } catch (err) {
      console.error("vendorOnline error", err);
    }
  });

  socket.on("vendorOnlineForDate", async ({ vendorId, pincode, dateKey }) => {
  if (!vendorId || !pincode || !dateKey) return;

  const vendorIdStr = String(vendorId);
  const pincodeStr = String(pincode).trim();

  const pendingPincodeSet = `orders:pending:date:${dateKey}:pincode:${pincodeStr}`;
  const ids = await redis.sMembers(pendingPincodeSet);

  for (const orderId of ids) {
    const rejected = await redis.sIsMember(`rejected:${orderId}`, vendorIdStr);
    if (rejected) continue;

    const orderData = await redis.hGetAll(`order:${orderId}`);
    if (!orderData || !Object.keys(orderData).length) continue;
    if (orderData.status !== "pending") continue;

    socket.emit("orderForPincode", {
      orderId: Number(orderData.orderId),
      pincode: orderData.pincode,
      latitude: Number(orderData.latitude),
      longitude: Number(orderData.longitude),
      slot: orderData.slot || "",
      date: orderData.date,
      testType: orderData.testType,
      isReplay: true,
      debugDateKey: dateKey,
    });
  }
});

}
