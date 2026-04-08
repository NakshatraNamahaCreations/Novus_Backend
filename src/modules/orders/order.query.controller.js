// ─── order.query.controller.js ────────────────────────────────────────────────
// Handles: getAllOrders, getLabOrders, getOrderById, getOrderResultsById,
//          getOrdersByPatientId, getOrdersByPatientIdTrack,
//          getOrdersByPatientIdCompleted, getOrdersByPrimaryPatientId,
//          updateOrderStatus, updateAssignvendor, cancelOrder, rescheduleOrder
// ─────────────────────────────────────────────────────────────────────────────


import { uploadToS3 } from "../../config/s3.js";
import { markOrderReportReady } from "./order.service.js";
import { parseISTDateTime } from "./order.helpers.js";

import prisma from '../../lib/prisma.js';
import { whatsappQueue } from "../../queues/whatsapp.queue.js";

// ─── Shared patient select ────────────────────────────────────────────────────

const PATIENT_SELECT = { id: true, fullName: true, email: true, contactNo: true };

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL ORDERS (admin list)
// ─────────────────────────────────────────────────────────────────────────────

export const getAllOrders = async (req, res) => {
  try {
    let {
      page = 1, limit = 10, search = "",
      status = "", paymentStatus = "",
      fromDate, toDate,
      refCenterId = "", diagnosticCenterId = "",
      centerId = "", source = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const user = req.user;
    const where = {};

    // Role restriction
    if (user?.role === "admin") {
      const ids = Array.isArray(user?.diagnosticCenterIds) ? user.diagnosticCenterIds : [];
      if (ids.length > 0) where.diagnosticCenterId = { in: ids };
      else return res.status(200).json({ success: false, message: "No orders for this user" });
    }

    // Default date range to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!fromDate) fromDate = today.toISOString().split("T")[0];
    if (!toDate) toDate = today.toISOString().split("T")[0];

    if (search) {
      const s = String(search).trim();
      const asNumber = Number(s);
      const isNumeric = s !== "" && Number.isFinite(asNumber);
      where.OR = [
        ...(isNumeric ? [{ id: asNumber }] : []),
        { orderNumber: { contains: s, mode: "insensitive" } },
        { trackingId: { contains: s, mode: "insensitive" } },
        { source: { contains: s, mode: "insensitive" } },
        { patient: { fullName: { contains: s, mode: "insensitive" } } },
        { patient: { contactNo: { contains: s, mode: "insensitive" } } },
      ];
    }

    if (status && status !== "all") where.status = status;

    if (paymentStatus === "pending") where.paymentStatus = { in: ["pending", "AUTHORIZED", "FAILED", "PENDING"] };
    if (paymentStatus === "paid") where.paymentStatus = { in: ["CAPTURED", "COMPLETED", "paid"] };

    if (fromDate && toDate) {
      const start = new Date(fromDate); start.setHours(0, 0, 0, 0);
      const end = new Date(toDate); end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    if (refCenterId && refCenterId !== "all") {
      const id = Number(refCenterId);
      if (Number.isFinite(id)) where.refCenterId = id;
    }
    if (diagnosticCenterId && diagnosticCenterId !== "all") {
      const id = Number(diagnosticCenterId);
      if (Number.isFinite(id)) where.diagnosticCenterId = id;
    }
    if (centerId && centerId !== "all") {
      const id = Number(centerId);
      if (Number.isFinite(id)) where.centerId = id;
    }
    if (source && source !== "all") {
      where.source = { contains: String(source), mode: "insensitive" };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true,
          totalAmount: true, finalAmount: true, discount: true, paymentMode: true,
          date: true, reportReady: true, sampleCollected: true, createdAt: true,
          isSelf: true, trackingId: true, isHomeSample: true, source: true,
          refCenter: { select: { id: true, name: true } },
          patient: { select: PATIENT_SELECT },
          // vendor:           { select: { id: true, name: true, email: true } },
          slot: { select: { id: true, name: true, startTime: true, endTime: true } },
          centerSlot: { select: { id: true, name: true, startTime: true, endTime: true } },
          address: { select: { id: true, address: true, pincode: true, city: true } },
          center: { select: { id: true, name: true, contactName: true, address: true, mobile: true } },
          diagnosticCenter: { select: { id: true, name: true, } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return res.json({
      success: true, orders,
      meta: { currentPage: page, totalPages: Math.ceil(total / limit), total, perPage: limit },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET LAB ORDERS (advanced filter)
// ─────────────────────────────────────────────────────────────────────────────

export const getLabOrders = async (req, res) => {
  try {
    let {
      page = 1, limit = 10,
      orderId = "", patientName = "", phone = "", testName = "",
      orderDate = "", fromDate = "", toDate = "",
      status = "", paymentStatus = "", source = "",
      refCenterId = "", diagnosticCenterId = "", centerId = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;
    const user = req.user;
    const where = {};

    if (user?.role === "admin") {
      const ids = Array.isArray(user?.diagnosticCenterIds) ? user.diagnosticCenterIds : [];
      if (ids.length > 0) where.diagnosticCenterId = { in: ids };
      else return res.status(200).json({ success: false, message: "No orders for this user" });
    }

    if (orderId) {
      const n = Number(String(orderId).trim());
      if (Number.isFinite(n)) where.id = n;
    }

    if (patientName) {
      where.patient = { fullName: { contains: String(patientName).trim(), mode: "insensitive" } };
    }

    if (phone) {
      where.patient = { ...where.patient, contactNo: { contains: String(phone).trim(), mode: "insensitive" } };
    }

    if (testName) {
      const t = String(testName).trim();
      where.OR = [
        { orderCheckups: { some: { checkup: { name: { contains: t, mode: "insensitive" } } } } },
        {
          orderMembers: {
            some: {
              orderMemberPackages: {
                some: {
                  OR: [
                    { test: { name: { contains: t, mode: "insensitive" } } },
                    { package: { name: { contains: t, mode: "insensitive" } } },
                  ],
                },
              },
            },
          },
        },
      ];
    }

    if (orderDate) {
      const d = new Date(orderDate);
      if (!isNaN(d)) {
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const end = new Date(d); end.setHours(23, 59, 59, 999);
        where.date = { gte: start, lte: end };
      }
    }

    if (fromDate) { const s = new Date(fromDate); s.setHours(0, 0, 0, 0); where.createdAt = { ...where.createdAt, gte: s }; }
    if (toDate) { const e = new Date(toDate); e.setHours(23, 59, 59, 999); where.createdAt = { ...where.createdAt, lte: e }; }

    if (status && status !== "all") where.status = status;
    if (paymentStatus === "pending") where.paymentStatus = { in: ["pending", "AUTHORIZED", "FAILED", "PENDING"] };
    else if (paymentStatus === "paid") where.paymentStatus = { in: ["CAPTURED", "COMPLETED", "paid"] };
    if (source && source !== "all") where.source = { contains: String(source), mode: "insensitive" };

    if (refCenterId && refCenterId !== "all") {
      const id = Number(refCenterId);
      if (Number.isFinite(id)) where.refCenterId = id;
    }

    if (diagnosticCenterId && diagnosticCenterId !== "all") {
      const id = Number(diagnosticCenterId);
      if (Number.isFinite(id)) {
        where.diagnosticCenterId = (user?.role === "admin" && where.diagnosticCenterId?.in)
          ? { in: where.diagnosticCenterId.in.filter((x) => x === id) }
          : id;
      }
    }

    if (centerId && centerId !== "all") {
      const id = Number(centerId);
      if (Number.isFinite(id)) where.centerId = id;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true,
          totalAmount: true, finalAmount: true, discount: true, paymentMode: true,
          date: true, reportReady: true, sampleCollected: true, createdAt: true,
          isSelf: true, trackingId: true, isHomeSample: true, source: true,
          refCenter: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true, initial: true } },
          patient: { select: PATIENT_SELECT },
          vendor: { select: { id: true, name: true, email: true } },
          slot: { select: { id: true, name: true, startTime: true, endTime: true } },
          centerSlot: { select: { id: true, name: true, startTime: true, endTime: true } },
          address: { select: { id: true, address: true, pincode: true, city: true } },
          center: { select: { id: true, name: true, contactName: true, address: true, mobile: true } },
          diagnosticCenter: { select: { id: true, name: true, address: true, pincode: true, cityId: true } },
          orderCheckups: { select: { checkup: { select: { id: true, name: true } } } },
          orderMembers: {
            select: {
              orderMemberPackages: {
                select: {
                  test: { select: { id: true, name: true } },
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
      success: true, orders,
      meta: { currentPage: page, totalPages: Math.ceil(total / limit), total, perPage: limit },
    });
  } catch (error) {
    console.error("Error fetching lab orders:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORDER BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getOrderById = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ success: false, message: "Invalid order ID" });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        patient: {
          select: {
            id: true, fullName: true, email: true, contactNo: true, dob: true,
            age: true, gender: true, bloodType: true, height: true, weight: true,
            smokingHabit: true, alcoholConsumption: true, exerciseFrequency: true,
          },
        },
        payments: { select: { id: true, invoiceUrl: true } },
        address: { select: { id: true, city: true, state: true, pincode: true, landmark: true, latitude: true, longitude: true } },
        vendor: { select: { id: true, name: true, number: true, city: true } },
        refCenter: { select: { id: true, name: true, mobile: true, city: true } },
        doctor: { select: { id: true, name: true, mobile: true } },
        center: { select: { id: true, name: true, contactName: true, address: true, mobile: true } },
        orderMembers: {
          include: {
            patient: { select: { id: true, fullName: true, contactNo: true, gender: true, age: true } },
            orderMemberPackages: {
              include: {
                test: {
                  select: { id: true, name: true, actualPrice: true, offerPrice: true, discount: true, testType: true, sampleRequired: true, preparations: true },
                },
                package: {
                  select: {
                    id: true, name: true, actualPrice: true, offerPrice: true, description: true,
                    imgUrl: true, testType: true, noOfParameter: true,
                    checkupPackages: {
                      include: {
                        test: { select: { id: true, name: true, testType: true, actualPrice: true, offerPrice: true, sampleRequired: true } },
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

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    return res.json({ success: true, order });
  } catch (error) {
    console.error("Error fetching order details:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch order details" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORDER RESULTS BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getOrderResultsById = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ success: false, message: "Invalid order ID" });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderMembers: {
          select: {
            id: true, orderId: true, patientId: true,
            patient: { select: { id: true, fullName: true, contactNo: true, gender: true, age: true } },
            orderMemberPackages: {
              select: {
                id: true, orderMemberId: true, packageId: true, testId: true, price: true,
                test: { select: { id: true, name: true, actualPrice: true, offerPrice: true, discount: true, testType: true, sampleRequired: true, preparations: true } },
                package: {
                  select: {
                    id: true, name: true, actualPrice: true, offerPrice: true, description: true, testType: true,
                    checkupPackages: {
                      include: {
                        test: { select: { id: true, name: true, testType: true, actualPrice: true, offerPrice: true, sampleRequired: true } },
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

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const results = await prisma.patientTestResult.findMany({
      where: { orderId },
      orderBy: [{ reportedAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, patientId: true, testId: true, status: true, reportedAt: true, reportHtml: true, updatedAt: true },
    });

    // Priority map: APPROVED > latest
    const resultMap = new Map();
    for (const r of results) {
      const key = `${orderId}_${r.patientId}_${r.testId}`;
      const existing = resultMap.get(key);
      if (!existing) { resultMap.set(key, r); continue; }
      if (existing.status !== "APPROVED" && r.status === "APPROVED") { resultMap.set(key, r); continue; }
      if (new Date(r.updatedAt) > new Date(existing.updatedAt)) resultMap.set(key, r);
    }

    const orderMembers = order.orderMembers.map((member) => ({
      ...member,
      orderMemberPackages: member.orderMemberPackages.map((omp) => {
        if (omp.testId && omp.test) {
          const result = resultMap.get(`${orderId}_${member.patientId}_${omp.testId}`);
          return {
            ...omp, resultAdded: !!result,
            test: { ...omp.test, result: result ? { id: result.id, status: result.status, reportedAt: result.reportedAt, reportHtml: result.reportHtml } : null },
            package: null,
          };
        }

        if (omp.packageId && omp.package) {
          let completed = 0, approvedCount = 0;
          const packageTests = omp.package.checkupPackages.map((cp) => {
            const result = resultMap.get(`${orderId}_${member.patientId}_${cp.test.id}`);
            if (result) completed++;
            if (result?.status === "APPROVED") approvedCount++;
            return { ...cp, test: { ...cp.test, result: result ? { id: result.id, status: result.status, reportedAt: result.reportedAt, reportHtml: result.reportHtml } : null } };
          });

          let resultStatus = "PENDING";
          if (completed === packageTests.length && packageTests.length > 0)
            resultStatus = approvedCount === packageTests.length ? "APPROVED" : "COMPLETED";
          else if (completed > 0) resultStatus = "PARTIAL";

          return {
            ...omp, resultAdded: completed === packageTests.length, test: null,
            package: { ...omp.package, checkupPackages: packageTests, completedTests: completed, totalTests: packageTests.length, resultStatus },
          };
        }

        return null;
      }),
    }));

    return res.json({ success: true, orderMembers });
  } catch (error) {
    console.error("Error fetching order results:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch order results" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT ORDER QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export const getOrdersByPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const orders = await prisma.order.findMany({
      where: { OR: [{ patientId }, { orderMembers: { some: { patientId } } }] },
      include: {
        patient: { select: PATIENT_SELECT },
        address: true, vendor: true,
        slot: { select: { id: true, startTime: true, endTime: true } },
        centerSlot: { select: { id: true, startTime: true, endTime: true } },
        payments: { select: { id: true, invoiceUrl: true } },
        orderMembers: {
          where: { patientId },
          include: {
            patient: { select: PATIENT_SELECT },
            orderMemberPackages: {
              include: {
                package: { select: { id: true, name: true, description: true, actualPrice: true, offerPrice: true, imgUrl: true } },
              },
            },
          },
        },
        center: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
};

export const getOrdersByPatientIdTrack = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId))
      return res.status(400).json({ success: false, error: "Invalid patientId" });

    const orders = await prisma.order.findMany({
      where: {
        AND: [
          { OR: [{ patientId }, { orderMembers: { some: { patientId } } }] },
          { status: { not: "completed" } },
        ],
      },
      include: {
        patient: { select: PATIENT_SELECT },
        address: true, vendor: true,
        orderMembers: {
          where: { patientId },
          include: {
            patient: { select: PATIENT_SELECT },
            orderMemberPackages: {
              include: {
                package: { select: { id: true, name: true, description: true, actualPrice: true, offerPrice: true, imgUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
};

export const getOrdersByPatientIdCompleted = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId) || patientId <= 0)
      return res.status(400).json({ success: false, error: "Invalid patientId" });

    const orders = await prisma.order.findMany({
      where: {
        AND: [
          { OR: [{ patientId }, { orderMembers: { some: { patientId } } }] },
          { status: "completed" },
        ],
      },
      include: {
        patient: { select: PATIENT_SELECT },
        address: true,
        vendor: { select: { id: true, name: true, number: true } },
        vendorReview: { select: { id: true, rating: true, comment: true, createdAt: true, patientId: true, vendorId: true, orderId: true } },
        payments: { select: { id: true, invoiceUrl: true } },
        orderMembers: {
          where: { patientId },
          include: {
            patient: { select: PATIENT_SELECT },
            orderMemberPackages: {
              include: {
                package: { select: { id: true, name: true, description: true, actualPrice: true, offerPrice: true, imgUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const ordersWithFlags = orders.map((o) => ({
      ...o,
      isReviewed: !!o.vendorReview,
      canReview: o.status === "completed" && !!o.vendorId && !o.vendorReview,
    }));

    return res.json({ success: true, orders: ordersWithFlags });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
};

export const getOrdersByPrimaryPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const { reportReady } = req.query;
    const reportReadyBool =
      reportReady === "true" ? true : reportReady === "false" ? false : undefined;

    const orders = await prisma.order.findMany({
      where: { patientId, reportReady: reportReadyBool },
      select: {
        id: true, merchantOrderId: true, paymentStatus: true, status: true,
        reportReady: true, isHomeSample: true, sampleCollected: true, reportUrl: true,
        slot: { select: { id: true, startTime: true, endTime: true } },
        centerSlot: { select: { id: true, startTime: true, endTime: true } },
        patient: { select: PATIENT_SELECT },
        payments: { select: { id: true, invoiceUrl: true } },
        address: true,
        vendor: { select: { id: true, name: true, number: true } },
        orderMembers: {
          select: {
            id: true,
            patient: { select: PATIENT_SELECT },
            orderMemberPackages: {
              include: {
                package: { select: { id: true, name: true, description: true, actualPrice: true, offerPrice: true, imgUrl: true } },
                test: { select: { id: true, name: true, description: true, actualPrice: true, offerPrice: true, imgUrl: true, testType: true } },
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
    return res.status(500).json({ error: "Failed to fetch primary patient orders" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE / CANCEL / RESCHEDULE
// ─────────────────────────────────────────────────────────────────────────────

export const updateDocumentImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No document file provided" });

    const documentImage = await uploadToS3(req.file, "order-documents");
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { documentImage, sampleCollected: true, status: "sample_collected" },
    });

    return res.json({ message: "Document image updated successfully", order: updatedOrder });
  } catch (error) {
    console.error("Error updating document image:", error);
    return res.status(500).json({ error: "Failed to update document image" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, sampleCollected, reportReady, reportUrl } = req.body;

    const orderId = Number(id);
    if (!orderId) return res.status(400).json({ message: "Invalid order id" });

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
        ...(sampleCollected !== undefined && {
          sampleCollected: sampleCollected === "true" || sampleCollected === true,
          ...((sampleCollected === "true" || sampleCollected === true) && { sampleCollectedAt: new Date() }),
        }),
        ...(reportReady !== undefined && { reportReady: reportReady === "true" || reportReady === true }),
        ...(reportUrl && { reportUrl }),
      },
    });

    if (sampleCollected == true) {
      await whatsappQueue.add("whatsapp.sendSampleCollected", {
        orderId: order.id,
      });

    }

    if (status === "on_the_way") {
      await whatsappQueue.add("whatsapp.sendSampleExecutiveOnTheWay", {
        orderId: order.id,
      });
    }


    const io = req.app.get("io");
    if (io) io.to(`order_${order.id}`).emit("orderStatusForUser", { orderId: order.id, status: order.status });

    if (reportReady === "true" || reportReady === true) await markOrderReportReady(order);

    return res.json({ message: "Order updated successfully", order });
  } catch (error) {
    console.error("updateOrderStatus ERROR:", error);
    return res.status(500).json({ error: "Failed to update order", message: error?.message });
  }
};

export const updateAssignvendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    const order = await prisma.order.update({ where: { id: Number(id) }, data: { vendorId } });
    return res.json({ message: "Order updated successfully", order });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update order" });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy } = req.body;
    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: "cancelled", cancelledBy, cancelledAt: new Date() },
    });
    return res.json({ message: "Order cancelled successfully", order });
  } catch (error) {
    return res.status(500).json({ error: "Failed to cancel order" });
  }
};

export const rescheduleOrder = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { date, slotId, centerSlotId } = req.body;

    if (!Number.isFinite(orderId) || orderId <= 0)
      return res.status(400).json({ success: false, message: "Valid orderId required" });
    if (!date)
      return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });

    const newDate = new Date(date);
    if (isNaN(newDate.getTime()))
      return res.status(400).json({ success: false, message: "Invalid date" });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, centerId: true, isHomeSample: true, slotId: true, centerSlotId: true, date: true, status: true },
    });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (["cancelled", "completed"].includes(String(order.status).toLowerCase()))
      return res.status(400).json({ success: false, message: "Order cannot be rescheduled" });

    const wantsHomeSlot = slotId != null && slotId !== "";
    const wantsCenterSlot = centerSlotId != null && centerSlotId !== "";

    if (wantsHomeSlot && wantsCenterSlot)
      return res.status(400).json({ success: false, message: "Send either slotId or centerSlotId" });
    if (!wantsHomeSlot && !wantsCenterSlot)
      return res.status(400).json({ success: false, message: "Send slotId (home) or centerSlotId (center)" });

    // Center slot flow
    if (wantsCenterSlot) {
      const csId = Number(centerSlotId);
      if (!Number.isFinite(csId) || csId <= 0)
        return res.status(400).json({ success: false, message: "Valid centerSlotId required" });

      const slot = await prisma.centerSlot.findUnique({
        where: { id: csId },
        select: { id: true, centerId: true, capacity: true, isActive: true },
      });

      if (!slot || slot.isActive === false)
        return res.status(400).json({ success: false, message: "Center slot not available" });

      const dayStart = new Date(newDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(newDate); dayEnd.setHours(23, 59, 59, 999);

      const booked = await prisma.centerSlotBooking.aggregate({
        where: { centerSlotId: csId, slotDate: { gte: dayStart, lte: dayEnd } },
        _sum: { quantity: true },
      });

      if (slot.capacity > 0 && (booked?._sum?.quantity || 0) >= slot.capacity)
        return res.status(400).json({ success: false, message: "Selected slot is full for this date" });

      const updated = await prisma.$transaction(async (tx) => {
        const ord = await tx.order.update({
          where: { id: orderId },
          data: { date: newDate, centerSlotId: csId, slotId: null, isHomeSample: false, rescheduledAt: new Date(), rescheduledById: req.user?.id || null },
          include: { centerSlot: true, rescheduledBy: { select: { id: true, name: true, email: true } } },
        });
        await tx.centerSlotBooking.create({ data: { centerId: slot.centerId, centerSlotId: csId, slotDate: newDate, quantity: 1 } });
        return ord;
      });

      return res.json({ success: true, message: "Order rescheduled", data: updated });
    }

    // Home slot flow
    const sId = Number(slotId);
    if (!Number.isFinite(sId) || sId <= 0)
      return res.status(400).json({ success: false, message: "Valid slotId required" });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { date: newDate, slotId: sId, centerSlotId: null, isHomeSample: true, rescheduledAt: new Date(), rescheduledById: req.user?.id || null },
      include: { slot: true, rescheduledBy: { select: { id: true, name: true, email: true } } },
    });

    return res.json({ success: true, message: "Order rescheduled", data: updated });
  } catch (err) {
    console.error("RESCHEDULE ORDER ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};