// ─── order.vendor.controller.js ───────────────────────────────────────────────
// Handles: acceptOrderByVendor, rejectOrderByVendor, vendorStartJob,
//          vendorUpdateOrderStatus, getOrdersByVendor, getVendorOrdersBasic
// ─────────────────────────────────────────────────────────────────────────────

import redis from "../../config/redis.js";
import locationService from "../location/location.service.js";
import { istDateKey } from "../../utils/orderRedis.js";

import prisma from '../../lib/prisma.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_VENDOR_STATUSES = [
  "accepted", "on_the_way", "reached", "sample_collected", "completed",
];

// ─── Redis cleanup helper (used in acceptOrderByVendor) ───────────────────────

const cleanupOrderFromRedis = async (orderId, dateKey, pincodeStr) => {
  const idStr = String(orderId);
  const orderHash          = `order:${idStr}`;
  const pendingDateSet      = `orders:pending:date:${dateKey}`;
  const pendingPincodeSetNew = pincodeStr ? `orders:pending:date:${dateKey}:pincode:${pincodeStr}` : null;
  const orderGeoNew         = `orders:geo:date:${dateKey}`;
  const pendingAllOld       = `orders:pending`;
  const pendingPincodeSetOld = pincodeStr ? `orders:pending:pincode:${pincodeStr}` : null;

  await Promise.allSettled([
    redis.del(orderHash),
    redis.sRem(pendingDateSet, idStr),
    pendingPincodeSetNew ? redis.sRem(pendingPincodeSetNew, idStr) : Promise.resolve(0),
    redis.sendCommand(["ZREM", orderGeoNew, idStr]).catch(() => 0),
    redis.sRem(pendingAllOld, idStr).catch(() => 0),
    pendingPincodeSetOld ? redis.sRem(pendingPincodeSetOld, idStr).catch(() => 0) : Promise.resolve(0),
    redis.del(`rejected:${idStr}`).catch(() => 0),
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT ORDER
// ─────────────────────────────────────────────────────────────────────────────

export const acceptOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId } = req.body;

    if (!orderId || !vendorId) {
      return res.status(400).json({ success: false, message: "orderId and vendorId are required" });
    }

    const io = req.app.get("io");

    const orderDetails = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      select: {
        id: true, date: true, slot: true, vendorId: true, status: true,
        address: { select: { pincode: true } },
      },
    });

    if (!orderDetails)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (orderDetails.vendorId)
      return res.status(400).json({ success: false, message: "Order already accepted" });

    // Slot conflict check
    const conflict = await prisma.order.findFirst({
      where: {
        vendorId: Number(vendorId),
        date: orderDetails.date,
        slot: orderDetails.slot,
        status: { in: ["accepted", "assigned", "on_the_way"] },
      },
    });

    if (conflict)
      return res.status(400).json({ success: false, message: "You already accepted another job for this slot" });

    // Atomic: update order + earnings
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: Number(orderId) }, select: { vendorId: true },
      });
      if (existing?.vendorId) throw new Error("Order already accepted");

      const updatedOrder = await tx.order.update({
        where: { id: Number(orderId) },
        data: { vendorId: Number(vendorId), status: "accepted" },
        include: { patient: true, address: true },
      });

      const earningConfig = await tx.vendorEarningConfig.findFirst({ orderBy: { createdAt: "desc" } });
      const baseAmount = earningConfig?.baseAmount || 0;

      const vendor = await tx.vendor.findUnique({
        where: { id: Number(vendorId) }, select: { earnings: true },
      });
      const newBalance = (vendor?.earnings || 0) + baseAmount;

      await tx.vendor.update({ where: { id: Number(vendorId) }, data: { earnings: newBalance } });

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

    // Redis cleanup
    const dateKey = istDateKey(orderDetails.date);
    const pincodeStr = String(orderDetails.address?.pincode || "").trim();
    await cleanupOrderFromRedis(orderId, dateKey, pincodeStr);

    // Socket notifications
    io.to(`vendor_${vendorId}`).emit("orderAccepted", {
      orderId: Number(orderId), vendorId: Number(vendorId), order: result,
    });
    if (pincodeStr) io.to(`pin_${pincodeStr}`).emit("removeOrderFromList", { orderId: Number(orderId) });
    io.emit("removeOrderFromList", { orderId: Number(orderId) });
    io.emit("orderRemoved", { orderId: Number(orderId) });

    return res.json({ success: true, message: "Order accepted successfully", order: result });
  } catch (error) {
    console.error("acceptOrderByVendor error:", error);
    return res.status(400).json({ success: false, message: error.message || "Failed to accept order" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REJECT ORDER
// ─────────────────────────────────────────────────────────────────────────────

export const rejectOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId, reason } = req.body;

    if (!orderId || !vendorId || !reason) {
      return res.status(400).json({ success: false, message: "orderId, vendorId, and reason are required" });
    }

    const orderIdNum = Number(orderId);
    const vendorIdNum = Number(vendorId);

    if (isNaN(orderIdNum) || isNaN(vendorIdNum)) {
      return res.status(400).json({ success: false, message: "orderId and vendorId must be valid numbers" });
    }

    const [order, vendor] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderIdNum } }),
      prisma.vendor.findUnique({ where: { id: vendorIdNum } }),
    ]);

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    const existing = await prisma.vendorOrderRejection.findFirst({
      where: { orderId: orderIdNum, vendorId: vendorIdNum },
    });
    if (existing)
      return res.status(400).json({ success: false, message: "Order already rejected by vendor" });

    await prisma.vendorOrderRejection.create({
      data: { vendorId: vendorIdNum, orderId: orderIdNum, reason },
    });

    await redis.sAdd(`rejected:${orderIdNum}`, String(vendorIdNum));
    await redis.expire(`rejected:${orderIdNum}`, 3600 * 6);

    const io = req.app.get("io");
    if (io) io.to(`vendor_${vendorIdNum}`).emit("removeOrderFromList", { orderId: orderIdNum });

    return res.json({ success: true, message: "Order rejected successfully" });
  } catch (err) {
    console.error("Reject Error:", err);
    return res.status(500).json({ success: false, message: "Failed to reject order" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// START JOB (tracking)
// ─────────────────────────────────────────────────────────────────────────────

export const vendorStartJob = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { userLatitude, userLongitude, vendorId } = req.body;

    if (!vendorId || !userLatitude || !userLongitude) {
      return res.status(400).json({ error: "Vendor ID and patient coordinates are required." });
    }

    const order = await prisma.order.update({
      where: { id: Number(orderId) },
      data: { vendorId: Number(vendorId), status: "on_the_way" },
      select: { id: true, vendorId: true, address: true },
    });

    const tracking = await locationService.startOrderTracking(
      order.id,
      order.vendorId,
      parseFloat(order?.address?.latitude),
      parseFloat(order?.address?.longitude),
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${order.id}`).emit("trackingStarted", {
        orderId: order.id, vendorId: order.vendorId, startTime: tracking.startTime,
      });
    }

    return res.json({ success: true, message: "Job started and tracking initiated.", orderId: order.id, tracking });
  } catch (error) {
    console.error("Error starting vendor job:", error);
    return res.status(500).json({ success: false, error: "Failed to start vendor job: " + error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE ORDER STATUS (vendor)
// ─────────────────────────────────────────────────────────────────────────────

export const vendorUpdateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, vendorId } = req.body;

    if (!status || !vendorId) {
      return res.status(400).json({ success: false, message: "status and vendorId are required in body" });
    }

    if (!ALLOWED_VENDOR_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${ALLOWED_VENDOR_STATUSES.join(", ")}`,
      });
    }

    const [vendor, order] = await Promise.all([
      prisma.vendor.findUnique({ where: { id: parseInt(vendorId) } }),
      prisma.order.findUnique({ where: { id: parseInt(orderId) } }),
    ]);

    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.vendorId !== parseInt(vendorId)) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    const updateData = { status };
    if (status === "reached") updateData.reachedAt = new Date();
    if (status === "sample_collected") updateData.sampleCollected = true;
    if (status === "completed") updateData.completedAt = new Date();

    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: updateData,
      include: { patient: { select: { fullName: true, contactNo: true } }, address: true },
    });

    return res.json({ success: true, message: "Order status updated successfully", order: updatedOrder });
  } catch (error) {
    console.error("Status Update Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORDERS BY VENDOR
// ─────────────────────────────────────────────────────────────────────────────

export const getOrdersByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status } = req.query;
    const id = Number(vendorId);

    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid vendorId" });

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: { id: true, name: true, number: true, city: true, status: true },
    });
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    let statusFilter;
    if (!status) {
      statusFilter = { not: "completed" };
    } else {
      const list = status.split(",").map((s) => s.trim());
      statusFilter = list.length === 1 ? list[0] : { in: list };
    }

    const orders = await prisma.order.findMany({
      where: { vendorId: id, status: statusFilter },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, slot: true, date: true, testType: true, orderType: true,
        finalAmount: true, totalAmount: true, discount: true, status: true,
        patient: { select: { id: true, fullName: true, gender: true, contactNo: true } },
        address: { select: { id: true, city: true, state: true, pincode: true, landmark: true } },
        center: { select: { id: true, name: true } },
        orderMembers: {
          include: {
            patient: { select: { id: true, fullName: true, gender: true, contactNo: true } },
            orderMemberPackages: {
              include: {
                test: { select: { id: true, name: true, actualPrice: true, sampleRequired: true, preparations: true, discount: true } },
                package: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    return res.json({
      success: true, vendor,
      filterApplied: status || "excluding completed",
      totalOrders: orders.length, orders,
    });
  } catch (error) {
    console.error("Error fetching vendor orders:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch vendor orders" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET VENDOR ORDERS BASIC (paginated history)
// ─────────────────────────────────────────────────────────────────────────────

export const getVendorOrdersBasic = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    const id = Number(vendorId);

    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid vendorId" });

    const take = Number(limit) || 10;
    const skip = (Number(page) - 1) * take;

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate)   dateFilter.lte = new Date(endDate);

    const where = {
      vendorId: id,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    };

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip, take,
        select: {
          id: true, date: true, createdAt: true, status: true, testType: true, finalAmount: true,
          orderMembers: {
            take: 1,
            select: {
              orderMemberPackages: {
                take: 1,
                select: {
                  test: { select: { id: true, name: true, testType: true } },
                  package: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return res.json({
      success: true,
      page: Number(page), limit: take,
      total: totalCount, totalPages: Math.ceil(totalCount / take),
      orders,
    });
  } catch (error) {
    console.error("Error fetching basic vendor orders:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch vendor basic orders" });
  }
};