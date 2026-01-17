import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import redis from "../../config/redis.js";
import { acquireLock } from "../../utils/redisLock.js";
import { bookSlotTx } from "../../utils/bookSlotTx.js"; // home slots
import { bookCenterSlotTx } from "../../utils/bookCenterSlotTx.js"; // ✅ new
import { invoiceQueue } from "../../queues/invoice.queue.js";
import { whatsappQueue } from "../../queues/whatsapp.queue.js";
import { vendorNotificationQueue } from "../../queues/vendorNotification.queue.js";
import { broadcastNewOrder } from "../../services/location.service.js";
import locationService from "../location/location.service.js";
import { uploadToS3 } from "../../config/s3.js";
import { istDateKey, isTodayIST, secondsToKeepForOrderDate, orderKeys } from "../../utils/orderRedis.js";

import { markOrderReportReady } from "./order.service.js";

const prisma = new PrismaClient();
const formatTime = (date) => dayjs(date).format("hh:mm A");


import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";


dayjs.extend(utc);
dayjs.extend(tz);





export const createOrder = async (req, res) => {
  let lock;

  try {
    const {
      source,
      addressId,
      patientId,
      totalAmount,
      discount,
      finalAmount,
      testType,
      date,
      doctorId,
      isSelf,
      members,
      paymentStatus,
      merchantOrderId,

      isHomeSample = false,

      // home sample
      slotId,

      // center sample
      centerId,
      centerSlotId,
    } = req.body;

    if (!members?.length) {
      return res.status(400).json({ error: "Members required" });
    }

    const orderDate = new Date(date);
    if (isNaN(orderDate)) {
      return res.status(400).json({ error: "Invalid date" });
    }

    // ✅ Validate booking inputs
    if (isHomeSample) {
      if (!slotId) {
        return res.status(400).json({ error: "slotId is required for home sample" });
      }
    } else {
      if (!centerId) return res.status(400).json({ error: "centerId is required for center booking" });
      if (!centerSlotId) return res.status(400).json({ error: "centerSlotId is required for center booking" });
    }

    /* 🔐 LOCK KEY */
    const lockKey = isHomeSample
      ? `lock:slot:${slotId}:${dayjs(orderDate).format("YYYY-MM-DD")}`
      : `lock:centerSlot:${centerSlotId}:${dayjs(orderDate).format("YYYY-MM-DD")}`;

    lock = await acquireLock(lockKey);

    /* 🧠 DB TRANSACTION */
    const order = await prisma.$transaction(async (tx) => {
      // ✅ book capacity
      if (isHomeSample) {
        await bookSlotTx(tx, Number(slotId), orderDate);
      } else {
        await bookCenterSlotTx(tx, Number(centerSlotId), orderDate);
      }

      const createdOrder = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          source,
          addressId,
          patientId,
          totalAmount,
          discount,
          finalAmount,
          doctorId,
          isSelf,
          testType,
          date: orderDate,
          status: "pending",
          paymentStatus: paymentStatus || "pending",
          merchantOrderId,

          isHomeSample: Boolean(isHomeSample),
          slotId: isHomeSample ? Number(slotId) : null,
          centerId: isHomeSample ? null : Number(centerId),
          centerSlotId: isHomeSample ? null : Number(centerSlotId),
        },
      });
      console.log("slotId",slotId)

      console.log("createdOrder",createdOrder)

      const paymentId = `PAY-${Date.now()}`;

      await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          patientId,
          paymentId,
          paymentMethod: "UPI",
          paymentMode: "ONLINE",
          paymentStatus: "COMPLETED",
          amount: finalAmount,
          currency: "INR",
          paymentDate: new Date(),
        },
      });

      await invoiceQueue.add("generate-invoice", { paymentId });
      return createdOrder;
    });

    /* 👥 MEMBERS */
    for (const m of members) {
      const orderMember = await prisma.orderMember.create({
        data: { orderId: order.id, patientId: m.patientId },
      });

      if (Array.isArray(m.packages)) {
        for (const pkgId of m.packages) {
          await prisma.orderMemberPackage.create({
            data: { orderMemberId: orderMember.id, packageId: Number(pkgId) },
          });
        }
      }

      if (Array.isArray(m.tests)) {
        for (const testId of m.tests) {
          // ⚠️ If you actually have orderMemberTest table, use it.
          // Keeping your original line but this looks like a schema bug:
          await prisma.orderMemberPackage.create({
            data: { orderMemberId: orderMember.id, testId: Number(testId) },
          });
        }
      }
    }

    // ✅ For notifications/broadcast you can still use address lat/long
    const address = await prisma.address.findUnique({ where: { id: addressId } });
    if (!address) return res.status(400).json({ error: "Address not found" });

    const lat = Number(address.latitude);
    const lng = Number(address.longitude);
    const pincodeStr = String(address.pincode || "").trim();

    // ✅ Slot label
    let slotLabel = "";
    if (isHomeSample) {
      const slotData = await prisma.slot.findUnique({ where: { id: Number(slotId) } });
      slotLabel = slotData
        ? `${formatTime(slotData.startTime)} - ${formatTime(slotData.endTime)}`
        : "";
    } else {
      const cs = await prisma.centerSlot.findUnique({ where: { id: Number(centerSlotId) } });
      slotLabel = cs ? `${cs.startTime} - ${cs.endTime}` : "";
    }

    // ✅ Always enqueue vendor notification (your existing flow)
    await vendorNotificationQueue.add(
      "notify-new-order",
      {
        orderId: order.id,
        pincode: pincodeStr,
        latitude: lat,
        longitude: lng,
        testType,
        radiusKm: 5,
      },
      { jobId: `vendor-new-order-${order.id}` }
    );

    /* -----------------------------
       ✅ REDIS: store until accepted/rejected
       ✅ INDEX BY ORDER DATE (IST)
    ------------------------------ */
    const dateKey = istDateKey(orderDate);
    const ttl = secondsToKeepForOrderDate(orderDate, 2);

    const { orderHash, pendingDateSet, pendingPincodeSet, orderGeo } = orderKeys({
      orderId: order.id,
      dateKey,
      pincode: pincodeStr,
    });

    // order hash
    await redis.hSet(orderHash, {
      orderId: String(order.id),
      date: orderDate.toISOString(),
      dateKey: String(dateKey),
      status: "pending",
      pincode: pincodeStr,
      latitude: String(lat),
      longitude: String(lng),
      testType: String(testType || ""),
      slot: String(slotLabel || ""),

      isHomeSample: String(Boolean(isHomeSample)),
      slotId: String(isHomeSample ? slotId : ""),
      centerId: String(!isHomeSample ? centerId : ""),
      centerSlotId: String(!isHomeSample ? centerSlotId : ""),
      createdAt: String(Date.now()),
    });

    // pending indexes
    await redis.sAdd(pendingDateSet, String(order.id));
    await redis.sAdd(pendingPincodeSet, String(order.id));

    // geo index for radius matching
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      await redis.sendCommand(["GEOADD", orderGeo, String(lng), String(lat), String(order.id)]);
    }

    // expiries (not 600 seconds!)
    await redis.expire(orderHash, ttl);
    await redis.expire(pendingDateSet, ttl);
    await redis.expire(pendingPincodeSet, ttl);
    await redis.expire(orderGeo, ttl);

    /* -----------------------------
       ✅ LIVE EMIT ONLY IF TODAY (IST)
    ------------------------------ */
    const io = req.app.get("io");
    const shouldBroadcastNow = isTodayIST(orderDate);

    if (io && shouldBroadcastNow) {
      await broadcastNewOrder(io, {
        id: order.id,
        date: orderDate,
        testType,
        radiusKm: 5,
        slot: slotLabel,
        address: {
          pincode: pincodeStr,
          latitude: lat,
          longitude: lng,
        },
      });
    }

    // respond
    res.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      dateKey,
      broadcasted: Boolean(shouldBroadcastNow),
    });

    await whatsappQueue.add(
      "whatsapp.sendOrderAndPayment",
      { orderId: order.id },
      { jobId: `whatsapp-orderpay-${order.id}`, removeOnComplete: true }
    );
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  } finally {
    if (lock?.release) await lock.release();
  }
};
export const createAdminOrder = async (req, res) => {
  try {
    const {
      patientId,
      selectedTests,

      // home collection
      addressId,
      homeCollection = false,

      // order
      registrationType,
      provisionalDiagnosis,
      notes,
      remark,
      source,

      // relations
      diagnosticCenterId,
      refCenterId,
      doctorId,

      // center collection (frontend uses collectionCenterId)
      centerId, // optional
      collectionCenterId, // optional (preferred from your UI)
      centerSlotId,
      slotId, // optional (home slot OR optional in center flow)

      // totals
      totalAmount: bodyTotalAmount,
      discount,
      discountAmount,
      finalAmount: bodyFinalAmount,

      // date
      date, // expected "YYYY-MM-DD" (home or order date)
      homeCollectionDate, // optional if frontend sends this instead of date
    } = req.body;

    console.log("slotId", slotId);
    console.log("date", date, "homeCollectionDate", homeCollectionDate);

    /* -------------------- helpers -------------------- */
    const castInt = (v) =>
      v === undefined || v === null || v === "" || Number.isNaN(Number(v))
        ? null
        : Number(v);

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizeType = (t) => {
      const type = String(t?.type || "").toLowerCase();
      if (type === "package" || type === "checkup") return "package";
      return "test";
    };

    const parseDateOrToday = (v) => {
      // accepts "YYYY-MM-DD" or ISO string; fallback today
      if (!v) return new Date();
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    };

    /* -------------------- validation -------------------- */
    if (
      !patientId ||
      !Array.isArray(selectedTests) ||
      selectedTests.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Patient & items required",
      });
    }

    const diagId = castInt(diagnosticCenterId);
    if (!diagId) {
      return res.status(400).json({
        success: false,
        message: "diagnosticCenterId is required",
      });
    }

    // validate selected items
    for (const item of selectedTests) {
      const id = castInt(item?.id ?? item?.testId ?? item?.packageId);
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Each selected item must have a valid id",
        });
      }
      const type = normalizeType(item);
      if (type !== "test" && type !== "package") {
        return res.status(400).json({
          success: false,
          message: "Each selected item must have a valid type: test | package",
        });
      }
    }

    // If home collection => address required + slotId required
    if (Boolean(homeCollection)) {
      const addr = castInt(addressId);
      if (!addr) {
        return res.status(400).json({
          success: false,
          message: "addressId is required for home collection",
        });
      }

      const sId = castInt(slotId);
      if (!sId) {
        return res.status(400).json({
          success: false,
          message: "slotId is required for home collection",
        });
      }
    } else {
      // center collection => center + centerSlot required
      const finalCenterId = castInt(centerId ?? collectionCenterId);
      const cSlotId = castInt(centerSlotId);

      if (!finalCenterId) {
        return res.status(400).json({
          success: false,
          message:
            "collectionCenterId/centerId is required for center collection",
        });
      }
      if (!cSlotId) {
        return res.status(400).json({
          success: false,
          message: "centerSlotId is required for center collection",
        });
      }
      // slotId is OPTIONAL for center collection (keep as optional)
    }

    /* -------------------- order number -------------------- */
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD${todayStr}` } },
    });
    const orderNumber = `ORD${todayStr}${String(count + 1).padStart(4, "0")}`;

    /* -------------------- totals -------------------- */
    const computedTotal = selectedTests.reduce(
      (sum, t) => sum + toNumber(t?.price ?? t?.amount ?? t?.total),
      0
    );

    const total =
      bodyTotalAmount !== undefined && bodyTotalAmount !== null
        ? toNumber(bodyTotalAmount)
        : computedTotal;

    const discountAmt =
      discountAmount !== undefined && discountAmount !== null
        ? toNumber(discountAmount)
        : discount !== undefined && discount !== null
        ? toNumber(discount)
        : 0;

    const finalAmt =
      bodyFinalAmount !== undefined && bodyFinalAmount !== null
        ? toNumber(bodyFinalAmount)
        : Math.max(0, total - discountAmt);

    /* -------------------- date (fix 1970 issue) -------------------- */
    const pickedDate = date || homeCollectionDate || null;
    const orderDate = parseDateOrToday(pickedDate);

    /* -------------------- build create data (SAFE CONNECTS) -------------------- */
    const dataToCreate = {
      orderNumber,
      createdBy: { connect: { id: castInt(req.user?.id) } },
      patient: { connect: { id: castInt(patientId) } },

      orderType: registrationType ?? null,

      totalAmount: Number(total),
      discount:
        discount !== undefined && discount !== null ? Number(discount) : 0,
      discountAmount: Number(discountAmt),
      finalAmount: Number(finalAmt),

      diagnosticCenter: { connect: { id: diagId } },
      source: source ?? undefined,

      // ✅ always valid
      date: orderDate,

      isHomeSample: Boolean(homeCollection),
      remarks: [provisionalDiagnosis, notes, remark]
        .filter(Boolean)
        .join(" | "),
    };

    // ✅ connect slot ONLY when present (prevents Prisma "id must not be null")
    const sId = castInt(slotId);
    if (sId) dataToCreate.slot = { connect: { id: sId } };

    // home collection relations
    if (Boolean(homeCollection)) {
      const addr = castInt(addressId);
      if (addr) dataToCreate.address = { connect: { id: addr } };
    }

    // center collection relations
    if (!Boolean(homeCollection)) {
      const finalCenterId = castInt(centerId ?? collectionCenterId);
      const cSlotId = castInt(centerSlotId);

      if (finalCenterId)
        dataToCreate.center = { connect: { id: finalCenterId } };
      if (cSlotId) dataToCreate.centerSlot = { connect: { id: cSlotId } };
      // slot already handled safely above (optional)
    }

    // optional relations
    const dId = castInt(doctorId);
    if (dId) dataToCreate.doctor = { connect: { id: dId } };

    const rId = castInt(refCenterId);
    if (rId) dataToCreate.refCenter = { connect: { id: rId } };

    /* -------------------- transaction -------------------- */
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: dataToCreate });

      const orderMember = await tx.orderMember.create({
        data: { orderId: order.id, patientId: castInt(patientId) },
      });

      await Promise.all(
        selectedTests.map((item) => {
          const id = castInt(item?.id ?? item?.testId ?? item?.packageId);
          const type = normalizeType(item);

          return tx.orderMemberPackage.create({
            data: {
              orderMemberId: orderMember.id,
              testId: type === "test" ? id : null,
              packageId: type === "package" ? id : null,
            },
          });
        })
      );

      return { orderId: order.id };
    });

    /* -------------------- fetch created order -------------------- */
    const createdOrder = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: {
        patient: true,
        address: true,
        orderMembers: {
          include: {
            orderMemberPackages: {
              include: {
                test: true,
                package: true,
              },
            },
          },
        },
        doctor: true,
        refCenter: true,
        center: true,
        centerSlot: true,
        diagnosticCenter: true,
        slot: true, // ✅ include slot so UI/whatsapp can read startTime/endTime
      },
    });

    // async notification (optional)
    try {
      await whatsappQueue.add(
        "whatsapp.sendOrderConfirmed",
        { orderId: result.orderId },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    } catch (e) {
      console.warn("WhatsApp queue failed:", e?.message);
    }

    return res.json({
      success: true,
      message: "Order created successfully",
      order: createdOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
      success: false,
      message: "Order failed",
      error: error.message,
    });
  }
};


export const acceptOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId } = req.body;

    if (!orderId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "orderId and vendorId are required",
      });
    }

    const io = req.app.get("io");

    /* --------------------------------------------------------
       STEP 1 — Get order details (need pincode for redis + room)
    ---------------------------------------------------------*/
    const orderDetails = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      select: {
        id: true,
        date: true,
        slot: true,
        vendorId: true,
        status: true,
        address: { select: { pincode: true } },
      },
    });

    if (!orderDetails) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (orderDetails.vendorId) {
      return res.status(400).json({ success: false, message: "Order already accepted" });
    }

    /* --------------------------------------------------------
       STEP 2 — Slot conflict check
    ---------------------------------------------------------*/
    const conflict = await prisma.order.findFirst({
      where: {
        vendorId: Number(vendorId),
        date: orderDetails.date,
        slot: orderDetails.slot,
        status: { in: ["accepted", "assigned", "on_the_way"] },
      },
    });

    if (conflict) {
      return res.status(400).json({
        success: false,
        message: "You already accepted another job for this slot",
      });
    }

    /* --------------------------------------------------------
       STEP 3 — Atomic transaction (ORDER + EARNINGS)
    ---------------------------------------------------------*/
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: Number(orderId) },
        select: { vendorId: true },
      });

      if (existing?.vendorId) throw new Error("Order already accepted");

      const updatedOrder = await tx.order.update({
        where: { id: Number(orderId) },
        data: {
          vendorId: Number(vendorId),
          status: "accepted",
        },
        include: {
          patient: true,
          address: true,
        },
      });

      const earningConfig = await tx.vendorEarningConfig.findFirst({
        orderBy: { createdAt: "desc" },
      });
      const baseAmount = earningConfig?.baseAmount || 0;

      const vendor = await tx.vendor.findUnique({
        where: { id: Number(vendorId) },
        select: { earnings: true },
      });

      const newBalance = (vendor?.earnings || 0) + baseAmount;

      await tx.vendor.update({
        where: { id: Number(vendorId) },
        data: { earnings: newBalance },
      });

      if (baseAmount > 0) {
        await tx.earningsHistory.create({
          data: {
            vendorId: Number(vendorId),
            title: "Order Accepted",
            desc: `Base earning for accepting order #${orderId}`,
            amount: baseAmount,
            type: "order_earning",
            balanceAfter: newBalance,
          },
        });
      }

      return updatedOrder;
    });

    /* --------------------------------------------------------
       STEP 4 — Remove from Redis (NEW + OLD keys) + verify + logs
    ---------------------------------------------------------*/
    const dateKey = istDateKey(orderDetails.date);
    const pincodeStr = String(orderDetails.address?.pincode || "").trim();
    const idStr = String(orderId);

    // NEW keys
    const orderHash = `order:${idStr}`;
    const pendingDateSet = `orders:pending:date:${dateKey}`;
    const pendingPincodeSetNew = pincodeStr
      ? `orders:pending:date:${dateKey}:pincode:${pincodeStr}`
      : null;
    const orderGeoNew = `orders:geo:date:${dateKey}`;

    // OLD keys (backward compatible)
    const pendingAllOld = `orders:pending`;
    const pendingPincodeSetOld = pincodeStr
      ? `orders:pending:pincode:${pincodeStr}`
      : null;

    console.log("🧹 Redis cleanup start:", {
      orderId: idStr,
      dateKey,
      pincodeStr,
      keys: {
        orderHash,
        pendingDateSet,
        pendingPincodeSetNew,
        orderGeoNew,
        pendingAllOld,
        pendingPincodeSetOld,
      },
    });

    const cleanupResults = await Promise.allSettled([
      // delete order hash
      redis.del(orderHash),

      // NEW indexes
      redis.sRem(pendingDateSet, idStr),
      pendingPincodeSetNew ? redis.sRem(pendingPincodeSetNew, idStr) : Promise.resolve(0),
      redis.sendCommand(["ZREM", orderGeoNew, idStr]).catch(() => 0),

      // OLD indexes
      redis.sRem(pendingAllOld, idStr).catch(() => 0),
      pendingPincodeSetOld ? redis.sRem(pendingPincodeSetOld, idStr).catch(() => 0) : Promise.resolve(0),

      // rejected set
      redis.del(`rejected:${idStr}`).catch(() => 0),
    ]);

    // Map results
    const [
      delHash,
      sremDate,
      sremNewPin,
      zremGeo,
      sremOldAll,
      sremOldPin,
      delRejected,
    ] = cleanupResults.map((r) => (r.status === "fulfilled" ? r.value : `ERR:${r.reason?.message}`));

    // Verify (after cleanup)
    const verify = await Promise.allSettled([
      redis.exists(orderHash),
      redis.sIsMember(pendingDateSet, idStr),
      pendingPincodeSetNew ? redis.sIsMember(pendingPincodeSetNew, idStr) : Promise.resolve(false),
      redis.sendCommand(["ZSCORE", orderGeoNew, idStr]).catch(() => null),
      redis.sIsMember(pendingAllOld, idStr).catch(() => false),
      pendingPincodeSetOld ? redis.sIsMember(pendingPincodeSetOld, idStr).catch(() => false) : Promise.resolve(false),
    ]);

    const [
      hashExists,
      stillInDateSet,
      stillInNewPinSet,
      geoScore,
      stillInOldAll,
      stillInOldPin,
    ] = verify.map((r) => (r.status === "fulfilled" ? r.value : `ERR:${r.reason?.message}`));

    console.log("✅ Redis cleanup results:", {
      delHash,
      sremDate,
      sremNewPin,
      zremGeo,
      sremOldAll,
      sremOldPin,
      delRejected,
    });

    console.log("🔎 Redis verify after cleanup:", {
      hashExists,               // should be 0
      stillInDateSet,           // should be false
      stillInNewPinSet,         // should be false
      geoScore,                 // should be null
      stillInOldAll,            // should be false
      stillInOldPin,            // should be false
    });

    /* --------------------------------------------------------
       STEP 5 — Socket notifications (remove immediately for others)
    ---------------------------------------------------------*/
    io.to(`vendor_${vendorId}`).emit("orderAccepted", {
      orderId: Number(orderId),
      vendorId: Number(vendorId),
      order: result,
    });

    if (pincodeStr) {
      io.to(`pin_${pincodeStr}`).emit("removeOrderFromList", {
        orderId: Number(orderId),
      });
    }

    // global fallback (safe)
    io.emit("removeOrderFromList", { orderId: Number(orderId) });

    // legacy
    io.emit("orderRemoved", { orderId: Number(orderId) });

    return res.json({
      success: true,
      message: "Order accepted successfully",
      order: result,
      redisCleanup: {
        dateKey,
        pincode: pincodeStr,
        removed: {
          delHash,
          sremDate,
          sremNewPin,
          zremGeo,
          sremOldAll,
          sremOldPin,
          delRejected,
        },
        verify: {
          hashExists,
          stillInDateSet,
          stillInNewPinSet,
          geoScore,
          stillInOldAll,
          stillInOldPin,
        },
      },
    });
  } catch (error) {
    console.error("acceptOrderByVendor error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to accept order",
    });
  }
};

export const vendorStartJob = async (req, res) => {
  // NOTE: vendorId is pulled from the request body for this example
  try {
    const { orderId } = req.params;
    const { userLatitude, userLongitude, vendorId } = req.body;

    if (!vendorId || !userLatitude || !userLongitude) {
      return res
        .status(400)
        .json({ error: "Vendor ID and patient coordinates are required." });
    }

    const vendorIdNumber = Number(vendorId);
    const orderIdNumber = Number(orderId);

    // 1. Assign the vendor to the order and update status to 'ASSIGNED'
    const order = await prisma.order.update({
      where: { id: orderIdNumber },
      data: {
        vendorId: vendorIdNumber,
        status: "on_the_way", // Set initial assignment status
      },
      select: { id: true, vendorId: true, address: true },
    });

    // 2. Start location tracking (This handles the ON_THE_WAY status update and upsert)
    const tracking = await locationService.startOrderTracking(
      order.id,
      order.vendorId,
      parseFloat(order?.address?.latitude),
      parseFloat(order?.address?.longitude)
    );

    // 3. Emit socket event
    const io = req.app.get("io");

    if (io) {
      io.to(`order_${order.id}`).emit("trackingStarted", {
        orderId: order.id,
        vendorId: order.vendorId,
        startTime: tracking.startTime,
      });
    }

    res.json({
      success: true,
      message: "Job started and tracking initiated.",
      orderId: order.id,
      tracking,
    });
  } catch (error) {
    console.error("Error starting vendor job:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start vendor job and tracking: " + error.message,
    });
  }
};

export const rejectOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId, reason } = req.body;

    if (!orderId || !vendorId || !reason) {
      return res.status(400).json({
        success: false,
        message: "orderId, vendorId, and reason are required",
      });
    }

    const orderIdNum = Number(orderId);
    const vendorIdNum = Number(vendorId);

    // Validate numeric IDs
    if (isNaN(orderIdNum) || isNaN(vendorIdNum)) {
      return res.status(400).json({
        success: false,
        message: "orderId and vendorId must be valid numbers",
      });
    }

    // Check order exists
    const order = await prisma.order.findUnique({ where: { id: orderIdNum } });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorIdNum },
    });
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Prevent duplicate reject
    const existing = await prisma.vendorOrderRejection.findFirst({
      where: { orderId: orderIdNum, vendorId: vendorIdNum },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Order already rejected by vendor",
      });
    }

    // Store rejection in DB
    await prisma.vendorOrderRejection.create({
      data: { vendorId: vendorIdNum, orderId: orderIdNum, reason },
    });

    /* ---------------------------------------------------
       🚫 Mark vendor as rejected for this order (Redis)
    ---------------------------------------------------- */
    await redis.sAdd(`rejected:${orderIdNum}`, String(vendorIdNum));

    // Optional expiry (you can remove this if rejections must be permanent)
    await redis.expire(`rejected:${orderIdNum}`, 3600 * 6);

    /* ---------------------------------------------------
       🔥 Socket: Remove from vendor UI instantly
    ---------------------------------------------------- */
    const io = req.app.get("io");
    if (io) {
      io.to(`vendor_${vendorIdNum}`).emit("removeOrderFromList", {
        orderId: orderIdNum,
      });
    }

    return res.json({
      success: true,
      message: "Order rejected successfully",
    });
  } catch (err) {
    console.error("Reject Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reject order",
    });
  }
};

/* ------------------------- UPDATE DOCUMENT IMAGE ------------------------- */
export const updateDocumentImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file)
      return res.status(400).json({ error: "No document file provided" });

    // Upload to S3
    const documentImage = await uploadToS3(req.file, "order-documents");

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        documentImage,
        sampleCollected: true,
        status: "sample_collected",
      },
    });

    res.json({
      message: "Document image updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating document image:", error);
    res.status(500).json({ error: "Failed to update document image" });
  }
};

export const getOrdersByPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    const orders = await prisma.order.findMany({
      where: {
        OR: [{ patientId }, { orderMembers: { some: { patientId } } }],
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },
        address: true,
        vendor: true,

        orderMembers: {
          where: { patientId },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },

            // FIXED RELATION
            orderMemberPackages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

export const getOrdersByPatientIdTrack = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid patientId" });
    }

    const orders = await prisma.order.findMany({
      where: {
        AND: [
          {
            OR: [{ patientId }, { orderMembers: { some: { patientId } } }],
          },
          {
            status: { not: "completed" },
          },
        ],
      },
      include: {
        patient: {
          select: { id: true, fullName: true, email: true, contactNo: true },
        },
        address: true,
        vendor: true,
        orderMembers: {
          where: { patientId },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
};

export const getOrdersByPatientIdCompleted = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid patientId" });
    }

    const orders = await prisma.order.findMany({
      where: {
        AND: [
          {
            OR: [{ patientId }, { orderMembers: { some: { patientId } } }],
          },
          {
            status: "completed",
          },
        ],
      },

      include: {
        patient: {
          select: { id: true, fullName: true, email: true, contactNo: true },
        },
        address: true,
        vendor: true,
         payments: {
          select: {
            id: true,
            invoiceUrl: true,
          },
        },
        orderMembers: {
          where: { patientId },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
};

export const getOrdersByPrimaryPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const { reportReady } = req.query;

    const reportReadyBool =
      reportReady === "true"
        ? true
        : reportReady === "false"
        ? false
        : undefined; // no filter if not provided
    const orders = await prisma.order.findMany({
      where: { patientId, reportReady: reportReadyBool },
      select: {
        id: true,
        merchantOrderId: true,
        paymentStatus: true,
        status: true,
        reportReady: true,
        isHomeSample: true,
        sampleCollected: true,
        reportUrl: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },
        payments: {
          select: {
            id: true,
            invoiceUrl: true,
          },
        },

        address: true,

        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },

        orderMembers: {
          select: {
            id: true,
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
                test: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                    testType: true,
                  },
                },
              },
            },
          },
        },

        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch primary patient orders" });
  }
};

/* ------------------------- GET ALL ORDERS ------------------------- */
export const getAllOrders = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      paymentStatus = "",
      date = "all",
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    let where = {};

    /* ----------------------------------
       SEARCH FILTER
    ---------------------------------- */
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { trackingId: { contains: search, mode: "insensitive" } },
        { source: { contains: search, mode: "insensitive" } },
        {
          patient: {
            fullName: { contains: search, mode: "insensitive" },
          },
        },
        {
          patient: {
            contactNo: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    /* ----------------------------------
       ORDER STATUS FILTER
    ---------------------------------- */
    if (status && status !== "all") {
      where.status = status;
    }

    /* ----------------------------------
       PAYMENT STATUS FILTER (FIXED)
    ---------------------------------- */
    if (paymentStatus === "pending") {
      // ✅ DUE PAYMENTS
      where.paymentStatus = {
        in: ["pending", "AUTHORIZED", "FAILED"],
      };
    }

    if (paymentStatus === "paid") {
      // ✅ COMPLETED PAYMENTS
      where.paymentStatus = {
        in: ["CAPTURED", "COMPLETED", "paid"],
      };
    }

    /* ----------------------------------
       DATE FILTER
    ---------------------------------- */
    if (date && date !== "all") {
      const now = new Date();
      let startDate;
      let endDate = new Date();

      if (date === "today") {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      }

      if (date === "yesterday") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      }

      if (date === "this_week") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
      }

      if (date === "this_month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      where.createdAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    /* ----------------------------------
       FETCH ORDERS
    ---------------------------------- */
    const orders = await prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },

      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        finalAmount: true,
        discount: true,
        paymentMode: true,
        date: true,
        reportReady: true,
        sampleCollected: true,
        createdAt: true,
        isSelf: true,
        trackingId: true,
        isHomeSample: true,
        source: true,

        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },

        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        slot: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
          },
        },

        address: {
          select: {
            id: true,
            address: true,
            pincode: true,
            city: true,
          },
        },
        center: {
          select: {
            id: true,
            name: true,
            contactName: true,
            address: true,
            mobile: true,
          },
        },
      },
    });

    /* ----------------------------------
       META
    ---------------------------------- */
    const total = await prisma.order.count({ where });
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      orders,
      meta: {
        currentPage: page,
        totalPages,
        total,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const orderId = Number(id);
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    /* --------------------------------------------------------------------
       🔥 FETCH ORDER WITH FULL DETAILS (same structure as getOrdersByVendor)
    --------------------------------------------------------------------- */
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
            dob: true,
            age: true,
            gender: true,
            bloodType: true,
            height: true,
            weight: true,
            smokingHabit: true,
            alcoholConsumption: true,
            exerciseFrequency: true,
          },
        },
        payments:{
          select:{
            id:true,
            invoiceUrl:true

          }
        },
        address: {
          select: {
            id: true,
            city: true,
            state: true,
            pincode: true,
            landmark: true,
            latitude: true,
            longitude: true,
          },
        },

        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
            city: true,
          },
        },
        refCenter: {
          select: {
            id: true,
            name: true,
            mobile: true,
            city: true,
          },
        },
        doctor: {
          select: {
            id: true,
            name: true,
            mobile: true,
          },
        },

        center: {
          select: {
            id: true,
            name: true,
            contactName: true,
            address: true,
            mobile: true,
          },
        },

        /* --------------------------------------------------------------
           🔥 Members + their tests + their packages
        -------------------------------------------------------------- */
        orderMembers: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                contactNo: true,
                gender: true,
              },
            },
            orderMemberPackages: {
              include: {
                // Standalone test booking
                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    discount: true,
                    testType: true,
                    sampleRequired: true,
                    preparations: true,
                  },
                },

                // Health checkup package booking
                package: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    description: true,
                    imgUrl: true,
                    testType: true,
                    noOfParameter: true,

                    // ✅ THIS IS THE IMPORTANT PART
                    checkupPackages: {
                      include: {
                        test: {
                          select: {
                            id: true,
                            name: true,
                            testType: true,
                            actualPrice: true,
                            offerPrice: true,
                            sampleRequired: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
    });
  }
};
export const getOrderResultsById = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    /* --------------------------------------------------
       1️⃣ Fetch order + members + tests/packages
    -------------------------------------------------- */
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderMembers: {
          select: {
            id: true,
            orderId: true,
            patientId: true,
            patient: {
              select: {
                id: true,
                fullName: true,
                contactNo: true,
                gender: true,
              },
            },
            orderMemberPackages: {
              select: {
                id: true,
                orderMemberId: true,
                packageId: true,
                testId: true,

                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    discount: true,
                    testType: true,
                    sampleRequired: true,
                    preparations: true,
                  },
                },

                package: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    description: true,
                    testType: true,
                    checkupPackages: {
                      include: {
                        test: {
                          select: {
                            id: true,
                            name: true,
                            testType: true,
                            actualPrice: true,
                            offerPrice: true,
                            sampleRequired: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    /* --------------------------------------------------
       2️⃣ Fetch ALL results for this order
       (order by latest first)
    -------------------------------------------------- */
    const results = await prisma.patientTestResult.findMany({
      where: { orderId },
      orderBy: [{ reportedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        patientId: true,
        testId: true,
        status: true,
        reportedAt: true,
        reportHtml: true,
        updatedAt: true,
      },
    });

    /* --------------------------------------------------
       3️⃣ Build STRONG result map
       Priority: APPROVED > latest
       key = orderId_patientId_testId
    -------------------------------------------------- */
    const resultMap = new Map();

    for (const r of results) {
      const key = `${orderId}_${r.patientId}_${r.testId}`;
      const existing = resultMap.get(key);

      if (!existing) {
        resultMap.set(key, r);
        continue;
      }

      // APPROVED always wins
      if (existing.status !== "APPROVED" && r.status === "APPROVED") {
        resultMap.set(key, r);
        continue;
      }

      // Otherwise keep latest
      if (new Date(r.updatedAt) > new Date(existing.updatedAt)) {
        resultMap.set(key, r);
      }
    }

    /* --------------------------------------------------
       4️⃣ Build FINAL RESPONSE (patient-safe)
    -------------------------------------------------- */
    const orderMembers = order.orderMembers.map((member) => ({
      id: member.id,
      orderId: member.orderId,
      patientId: member.patientId,
      patient: member.patient,

      orderMemberPackages: member.orderMemberPackages.map((omp) => {
        /* -------- INDIVIDUAL TEST -------- */
        if (omp.testId && omp.test) {
          const result = resultMap.get(
            `${orderId}_${member.patientId}_${omp.testId}`
          );

          return {
            id: omp.id,
            orderMemberId: omp.orderMemberId,
            packageId: null,
            testId: omp.testId,
            resultAdded: !!result,
            test: {
              ...omp.test,
              result: result
                ? {
                    id: result.id,
                    status: result.status,
                    reportedAt: result.reportedAt,
                    reportHtml: result.reportHtml,
                  }
                : null,
            },
            package: null,
          };
        }

        /* -------- PACKAGE -------- */
        if (omp.packageId && omp.package) {
          let completed = 0;
          let approvedCount = 0;

          const packageTests = omp.package.checkupPackages.map((cp) => {
            const result = resultMap.get(
              `${orderId}_${member.patientId}_${cp.test.id}`
            );

            if (result) completed++;
            if (result?.status === "APPROVED") approvedCount++;

            return {
              ...cp,
              test: {
                ...cp.test,
                result: result
                  ? {
                      id: result.id,
                      status: result.status,
                      reportedAt: result.reportedAt,
                      reportHtml: result.reportHtml,
                    }
                  : null,
              },
            };
          });

          let resultStatus = "PENDING";
          if (completed === packageTests.length && packageTests.length > 0) {
            resultStatus =
              approvedCount === packageTests.length ? "APPROVED" : "COMPLETED";
          } else if (completed > 0) {
            resultStatus = "PARTIAL";
          }

          return {
            id: omp.id,
            orderMemberId: omp.orderMemberId,
            packageId: omp.packageId,
            testId: null,
            resultAdded: completed === packageTests.length,
            test: null,
            package: {
              ...omp.package,
              checkupPackages: packageTests,
              completedTests: completed,
              totalTests: packageTests.length,
              resultStatus,
            },
          };
        }

        return null;
      }),
    }));

    /* --------------------------------------------------
       5️⃣ Send response
    -------------------------------------------------- */
    return res.json({
      success: true,
      orderMembers,
    });
  } catch (error) {
    console.error("Error fetching order results:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order results",
    });
  }
};

/* ------------------------- UPDATE ORDER STATUS ------------------------- */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, sampleCollected, reportReady, reportUrl } =
      req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
        ...(sampleCollected !== undefined && {
          sampleCollected:
            sampleCollected === "true" || sampleCollected === true,
        }),
        ...(reportReady !== undefined && {
          reportReady: reportReady === "true" || reportReady === true,
        }),
        ...(reportUrl && { reportUrl }),
      },
    });

    if (reportReady === "true" || reportReady === true) {
      console.log("report ready---");
      await markOrderReportReady(order);
    }

    res.json({ message: "Order updated successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
};

export const updateAssignvendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        vendorId,
      },
    });

    res.json({ message: "Order updated successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
};

/* ------------------------- CANCEL ORDER ------------------------- */
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy } = req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        status: "cancelled",
        cancelledBy,
        cancelledAt: new Date(),
      },
    });

    res.json({ message: "Order cancelled successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel order" });
  }
};

export const getOrdersByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status } = req.query;

    const id = Number(vendorId);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendorId",
      });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        number: true,
        city: true,
        status: true,
      },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    /* ---------------------------------------------------------
       STATUS FILTER LOGIC
    ---------------------------------------------------------- */

    let statusFilter;

    if (!status) {
      // Default: return everything except completed
      statusFilter = { not: "completed" };
    } else {
      // When status query provided
      const statusList = status.split(",").map((s) => s.trim());

      if (statusList.length === 1) {
        statusFilter = statusList[0]; // exact match
      } else {
        statusFilter = { in: statusList }; // multiple match
      }
    }

    /* ---------------------------------------------------------
       FETCH ORDERS
    ---------------------------------------------------------- */
    const orders = await prisma.order.findMany({
      where: {
        vendorId: id,
        status: statusFilter,
      },
      orderBy: { createdAt: "desc" },

      select: {
        id: true,
        slot: true,
        date: true,
        testType: true,
        orderType: true,
        finalAmount: true,
        totalAmount: true,
        discount: true,
        status: true,

        patient: {
          select: {
            id: true,
            fullName: true,
            gender: true,
            contactNo: true,
          },
        },

        address: {
          select: {
            id: true,
            city: true,
            state: true,
            pincode: true,
            landmark: true,
          },
        },

        center: {
          select: {
            id: true,
            name: true,
          },
        },

        orderMembers: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                gender: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
              include: {
                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    sampleRequired: true,
                    preparations: true,
                    discount: true,
                  },
                },
                package: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return res.json({
      success: true,
      vendor,
      filterApplied: status || "excluding completed",
      totalOrders: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Error fetching vendor orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor orders",
    });
  }
};

export const getVendorOrdersBasic = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const id = Number(vendorId);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendorId",
      });
    }

    // Pagination
    const take = Number(limit) || 10;
    const skip = (Number(page) - 1) * take;

    /* ---------------------------------------------------------
       DATE FILTER LOGIC
    ---------------------------------------------------------- */

    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      dateFilter = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      dateFilter = {
        lte: new Date(endDate),
      };
    }

    /* ---------------------------------------------------------
       FETCH ORDERS (BASIC FIELDS ONLY)
    ---------------------------------------------------------- */
    const orders = await prisma.order.findMany({
      where: {
        vendorId: id,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,

      select: {
        id: true,
        date: true,
        createdAt: true,
        status: true,
        testType: true,
        finalAmount: true,

        orderMembers: {
          take: 1, // Only first member
          select: {
            orderMemberPackages: {
              take: 1, // Only one test or package
              select: {
                test: {
                  select: {
                    id: true,
                    name: true,
                    testType: true,
                  },
                },
                package: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Total count for pagination
    const totalCount = await prisma.order.count({
      where: {
        vendorId: id,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
    });

    return res.json({
      success: true,
      page: Number(page),
      limit: take,
      total: totalCount,
      totalPages: Math.ceil(totalCount / take),
      orders,
    });
  } catch (error) {
    console.error("Error fetching basic vendor orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor basic orders",
    });
  }
};

export const vendorUpdateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, vendorId } = req.body;

    if (!status || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "status and vendorId are required in body",
      });
    }

    const allowedStatus = [
      "accepted",
      "on_the_way",
      "reached",
      "sample_collected",
      "completed",
    ];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatus.join(", ")}`,
      });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(vendorId) },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Get order
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check ownership
    if (order.vendorId !== parseInt(vendorId)) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this order",
      });
    }

    // Prepare update fields
    const updateData = { status };

    // Optional: Timestamp tracking
    if (status === "reached") updateData.reachedAt = new Date();
    if (status === "sample_collected") updateData.sampleCollected = true;
    if (status === "completed") updateData.completedAt = new Date();

    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: updateData,
      include: {
        patient: { select: { fullName: true, contactNo: true } },
        address: true,
      },
    });

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Status Update Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};

export const addOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      paymentMethod,
      paymentMode,
      amount,
      currency = "INR",
      transactionNote,
      referenceId,
      gatewayResponse,
      capturedAmount,
      ipAddress,
    } = req.body;

    // Get order with payments
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        payments: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Calculate existing payments
    const existingPaymentsTotal = order.payments.reduce((total, payment) => {
      return total + (payment.amount || 0);
    }, 0);

    const balance = order.finalAmount - existingPaymentsTotal;

    // Validate amount
    if (amount > balance) {
      return res.status(400).json({
        success: false,
        message: `Payment amount exceeds order balance. Maximum allowed: ${balance}`,
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    // Generate payment ID
    const paymentId = `PAY-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        orderId: parseInt(orderId),
        patientId: order.patientId,
        userId: req.user?.id,
        vendorId: order.vendorId,
        centerId: order.centerId,
        paymentId,
        paymentMethod: paymentMode?.toUpperCase(), // Prisma ENUM

        paymentStatus: "COMPLETED",
        amount,
        currency,
        paymentDate: new Date(),
        transactionNote,
        referenceId,
        gatewayResponse,
        capturedAmount: capturedAmount || amount,
        ipAddress: ipAddress || req.ip,
        createdById: req.user?.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Calculate new payment status
    const newTotalPaid = existingPaymentsTotal + amount;
    const newPaymentStatus =
      newTotalPaid >= order.finalAmount
        ? "paid"
        : newTotalPaid > 0
        ? "partially_paid"
        : "pending";

    // Update order payment status
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: { paymentStatus: newPaymentStatus },
      include: {
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
      },
    });

    // Update vendor earnings if applicable
    if (order.vendorId && amount > 0) {
      await prisma.vendor.update({
        where: { id: order.vendorId },
        data: {
          earnings: { increment: amount },
        },
      });

      // Create earnings history
      await prisma.earningsHistory.create({
        data: {
          vendorId: order.vendorId,
          title: "Order Payment Received",
          desc: `Payment of ${amount} ${currency} received for order ${order.orderNumber}`,
          amount,
          type: "add",
          balanceAfter: await prisma.vendor
            .findUnique({
              where: { id: order.vendorId },
              select: { earnings: true },
            })
            .then((vendor) => vendor.earnings),
          createdById: req.user?.id,
        },
      });
    }

    await invoiceQueue.add("generate-invoice", { paymentId });
    res.status(201).json({
      success: true,
      message: "Payment added to order successfully",
      payment,
      order: updatedOrder,
      summary: {
        orderTotal: order.finalAmount,
        previousPaid: existingPaymentsTotal,
        newPayment: amount,
        totalPaid: newTotalPaid,
        balance: order.finalAmount - newTotalPaid,
        paymentStatus: newPaymentStatus,
      },
    });
  } catch (error) {
    console.error("Add order payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding payment to order",
      error: error.message,
    });
  }
};

/**
 * @desc    Get order payment summary
 * @route   GET /api/orders/:orderId/payments/summary
 * @access  Private (Admin/Patient/Vendor)
 */

export const getOrderPaymentSummary = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        discount: true,
        finalAmount: true,
        paymentStatus: true,
        patientId: true,
        vendorId: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin") {
      if (req.user.patientId && order.patientId !== req.user.patientId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access order payments",
        });
      }
      if (req.user.vendorId && order.vendorId !== req.user.vendorId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access order payments",
        });
      }
    }

    // Get all payments for this order
    const payments = await prisma.payment.findMany({
      where: { orderId: parseInt(orderId) },
      orderBy: { createdAt: "desc" },
    });

    // Calculate summary
    const totalPaid = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    const totalRefunded = payments.reduce(
      (sum, payment) => sum + (payment.refundAmount || 0),
      0
    );
    const netPaid = totalPaid - totalRefunded;
    const balance = order.finalAmount - netPaid;

    // Group by payment method
    const paymentMethods = payments.reduce((acc, payment) => {
      const method = payment.paymentMethod;
      if (!acc[method]) {
        acc[method] = {
          method,
          count: 0,
          amount: 0,
        };
      }
      acc[method].count += 1;
      acc[method].amount += payment.amount;
      return acc;
    }, {});

    // Get recent payments
    const recentPayments = payments.slice(0, 5).map((payment) => ({
      id: payment.id,
      paymentId: payment.paymentId,
      amount: payment.amount,
      method: payment.paymentMethod,
      status: payment.paymentStatus,
      date: payment.paymentDate,
      refundAmount: payment.refundAmount,
    }));

    res.json({
      success: true,
      summary: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          discount: order.discount,
          finalAmount: order.finalAmount,
          paymentStatus: order.paymentStatus,
        },
        payments: {
          totalPaid,
          totalRefunded,
          netPaid,
          balance,
          isPaid: netPaid >= order.finalAmount,
          isPartiallyPaid: netPaid > 0 && netPaid < order.finalAmount,
        },
        byMethod: Object.values(paymentMethods),
        recentPayments,
        paymentCount: payments.length,
      },
    });
  } catch (error) {
    console.error("Get order payment summary error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order payment summary",
      error: error.message,
    });
  }
};

export const getOrderReports = async (req, res) => {
  try {
    let {
      date,
      fromDate,
      toDate,
      centerId,
      refCenterId,
      doctorId,
      diagnosticCenterId,
      status,
      source,
      city, // ✅ NEW
      pincode, // ✅ NEW
      page = 1,
      limit = 25,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const where = {};

    // ✅ DATE FILTERS
    if (date && date !== "") {
      const d = dayjs(date).startOf("day");
      where.date = {
        gte: d.toDate(),
        lt: d.add(1, "day").toDate(),
      };
    }

    if (fromDate && toDate && fromDate !== "" && toDate !== "") {
      where.date = {
        gte: dayjs(fromDate).startOf("day").toDate(),
        lt: dayjs(toDate).endOf("day").toDate(),
      };
    }

    // ✅ OTHER FILTERS
    if (centerId) where.centerId = Number(centerId);
    if (refCenterId) where.refCenterId = Number(refCenterId);
    if (doctorId) where.doctorId = Number(doctorId);
    if (diagnosticCenterId)
      where.diagnosticCenterId = Number(diagnosticCenterId);
    if (status) where.status = status;
    if (source) where.source = source;

    // ✅ CITY / PINCODE FILTER (works for both Home Sample + Center Visit)
    if ((city && city.trim()) || (pincode && pincode.trim())) {
      const c = city?.trim();
      const p = pincode?.trim();

      where.OR = [
        // 1) Match order address (home sample)
        {
          address: {
            ...(c ? { city: { contains: c, mode: "insensitive" } } : {}),
            ...(p ? { pincode: { contains: p, mode: "insensitive" } } : {}),
          },
        },

        // 2) Match center details (center visit)
        {
          center: {
            ...(p ? { pincode: { contains: p, mode: "insensitive" } } : {}),
            ...(c
              ? {
                  city: {
                    name: { contains: c, mode: "insensitive" },
                  },
                }
              : {}),
          },
        },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, contactNo: true } },
        address: {
          select: {
            id: true,
            city: true,
            state: true,
            pincode: true,
            address: true,
          },
        }, // ✅ IMPORTANT

        center: {
          select: {
            id: true,
            name: true,
            address: true,
            mobile: true,
            contactName: true,
            pincode: true,
            city: { select: { id: true, name: true } }, // ✅ IMPORTANT for city filter
          },
        },

        refCenter: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        diagnosticCenter: { select: { id: true, name: true } },

        orderCheckups: {
          include: {
            checkup: { select: { id: true, name: true } },
          },
        },

        orderMembers: {
          include: {
            patient: { select: { fullName: true } },
            orderMemberPackages: {
              include: {
                package: true,
                test: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.order.count({ where });

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    console.error("Order report error:", error);
    return res.status(500).json({ error: "Failed to fetch order reports" });
  }
};

export const getOrdersExpiringSoon = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const now = dayjs();
    const next30Min = now.add(30, "minute");

    // ✅ common where
    const where = {
      vendorId: null,
      status: "pending",
      source: "app",
      isHomeSample: true,

      // ✅ FIX: slot is a relation -> use isNot / is
      // slot: { isNot: null },
      // (Alternative if you have slotId in model: slotId: { not: null })
    };

    // 1️⃣ Count total orders
    const totalOrders = await prisma.order.count({ where });

    // 2️⃣ Fetch orders with pagination
    const orders = await prisma.order.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
          },
        },
        address: true,

        // ✅ include slot if you need time info
        slot: true,
      },
      orderBy: { date: "asc" },
      skip,
      take: limitNum,
    });

    // 3️⃣ Calculate mins left (based on slot relation fields)
    // NOTE: adjust these based on your Slot model fields (startTime/endTime)
    const ordersWithTimeLeft = orders
      .map((order) => {
        // If your Slot has startTime/endTime stored as "hh:mm A" strings
        const slotLabel =
          order.slot?.startTime && order.slot?.endTime
            ? `${order.slot.startTime} - ${order.slot.endTime}`
            : order.slot?.label || "";

        // We compute using slot.startTime (recommended)
        const slotStart = order.slot?.startTime || null;

        let minsLeft = null;
        let slotDateTime = null;

        if (slotStart) {
          slotDateTime = dayjs(
            `${dayjs(order.date).format("YYYY-MM-DD")} ${slotStart}`,
            "YYYY-MM-DD hh:mm A"
          );
          minsLeft = slotDateTime.diff(now, "minute");
        }

        return {
          ...order,
          slotLabel,
          minsLeft,
        };
      })
      // ✅ Optional: only those expiring within next 30 mins (and not negative)
      .filter(
        (o) =>
          typeof o.minsLeft === "number" && o.minsLeft >= 0 && o.minsLeft <= 30
      );

    res.json({
      success: true,
      orders: ordersWithTimeLeft,
      total: totalOrders,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalOrders / limitNum),
      filteredCount: ordersWithTimeLeft.length,
    });
  } catch (error) {
    console.error("Expiring orders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expiring orders",
      error: error?.message,
    });
  }
};
