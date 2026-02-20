// orderSocket.js
import redis from "../config/redis.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { istDateKey, orderKeys } from "../utils/orderRedis.js";

async function getVendorActivePincodes(vendorId) {
  try {
    const vid = Number(vendorId);
    if (!Number.isFinite(vid)) return [];

    const rows = await prisma.vendorPincode.findMany({
      where: { vendorId: vid, isActive: true },
      select: { pincode: true },
      orderBy: [{ priority: "desc" }, { id: "desc" }],
    });

    // unique + clean
    const pins = [...new Set(rows.map((r) => String(r.pincode).trim()).filter(Boolean))];
    return pins;
  } catch (err) {
    console.error("getVendorActivePincodes error", err);
    return [];
  }
}

async function replayPendingOrdersForPincodes({
  socket,
  vendorIdStr,
  pincodes,
  dateKey,
}) {
  try {
    if (!Array.isArray(pincodes) || pincodes.length === 0) return;

    // ✅ avoid sending duplicates in case of any overlap
    const sent = new Set();

    for (const pincodeStr of pincodes) {
      const pendingPincodeSet = `orders:pending:date:${dateKey}:pincode:${pincodeStr}`;
      const ids = await redis.sMembers(pendingPincodeSet);

      for (const orderId of ids) {
        const orderIdStr = String(orderId);

        const rejected = await redis.sIsMember(`rejected:${orderIdStr}`, vendorIdStr);
        if (rejected) continue;

        const orderData = await redis.hGetAll(`order:${orderIdStr}`);
        if (!orderData || !Object.keys(orderData).length) continue;
        if (orderData.status !== "pending") continue;

        // ✅ HARD FILTER: do not send past/future date jobs
        if (String(orderData.dateKey) !== String(dateKey)) continue;

        // ✅ no duplicates
        if (sent.has(orderIdStr)) continue;
        sent.add(orderIdStr);

        socket.emit("orderForPincode", {
          orderId: Number(orderData.orderId || orderIdStr),
          slotId: orderData.slotId,
          slot: orderData.slot || "",
          date: orderData.date,
          status: orderData.status,
          testType: orderData.testType,
          pincode: orderData.pincode,
          latitude: Number(orderData.latitude),
          longitude: Number(orderData.longitude),
          isReplay: true,
          debugDateKey: dateKey,
        });
      }
    }
  } catch (err) {
    console.error("replayPendingOrdersForPincodes error", err);
  }
}

export default function orderSocket(io, socket) {
  socket.on("ping", (msg) => socket.emit("pong", msg));

  // ✅ Now pincode is OPTIONAL (server can derive from vendorId)
  socket.on("vendorOnline", async ({ vendorId, pincode }) => {
    try {
      if (!vendorId) return;

      const vendorIdStr = String(vendorId);

      // ✅ leave ALL previous pin_ rooms
      for (const room of socket.rooms) {
        if (room.startsWith("pin_")) socket.leave(room);
      }

      socket.join(`vendor_${vendorIdStr}`);

      // ✅ Determine pincodes
      let pincodes = [];

      // If client still sends pincode, you can restrict to it
      const passedPin = String(pincode || "").trim();
      if (passedPin) {
        pincodes = [passedPin];
      } else {
        pincodes = await getVendorActivePincodes(vendorIdStr);
      }

      if (!pincodes.length) return;

      // ✅ join ALL pin rooms (or just 1 if passed)
      for (const pin of pincodes) socket.join(`pin_${pin}`);

      const todayKey = istDateKey(new Date());

      // ✅ Replay pending orders for those pincodes for today
      await replayPendingOrdersForPincodes({
        socket,
        vendorIdStr,
        pincodes,
        dateKey: todayKey,
      });
    } catch (err) {
      console.error("vendorOnline error", err);
    }
  });

  // ✅ Now pincode is OPTIONAL here too
  socket.on("vendorOnlineForDate", async ({ vendorId, pincode, dateKey }) => {
    try {
      if (!vendorId || !dateKey) return;

      const vendorIdStr = String(vendorId);

      // ✅ Determine pincodes
      let pincodes = [];
      const passedPin = String(pincode || "").trim();

      if (passedPin) {
        pincodes = [passedPin];
      } else {
        pincodes = await getVendorActivePincodes(vendorIdStr);
      }

      if (!pincodes.length) return;

      await replayPendingOrdersForPincodes({
        socket,
        vendorIdStr,
        pincodes,
        dateKey: String(dateKey),
      });
    } catch (err) {
      console.error("vendorOnlineForDate error", err);
    }
  });
}