// ─── order.create.controller.js ───────────────────────────────────────────────
// Handles: createOrder (patient-facing) + createAdminOrder (back-office)
// ─────────────────────────────────────────────────────────────────────────────

import dayjs from "dayjs";
import redis from "../../config/redis.js";
import { acquireLock } from "../../utils/redisLock.js";
import { bookSlotTx } from "../../utils/bookSlotTx.js";

import { invoiceQueue } from "../../queues/invoice.queue.js";
import { whatsappQueue } from "../../queues/whatsapp.queue.js";
import { vendorNotificationQueue } from "../../queues/vendorNotification.queue.js";
import { broadcastNewOrder } from "../../services/location.service.js";

import {
  istDateKey,
  isTodayIST,
  secondsToKeepForOrderDate,
  orderKeys,
} from "../../utils/orderRedis.js";
import { formatTimeIST } from "../../utils/timezone.js";

import {
  normalizeUnit,
  computeDueAt,
  parseISTDateTime,
  castInt,
  toNumber,
  normalizeItemType,
} from "./order.helpers.js";

import prisma from '../../lib/prisma.js';

// ─── Shared include for test/package SLA fetch ────────────────────────────────

const fetchTestsAndPackages = async (members) => {
  const testIds = [];
  const packageIds = [];

  for (const m of members) {
    if (Array.isArray(m?.tests)) testIds.push(...m.tests.map(Number));
    if (Array.isArray(m?.packages)) packageIds.push(...m.packages.map(Number));
  }

  const uniqueTestIds = [...new Set(testIds)].filter(Number.isFinite);
  const uniquePackageIds = [...new Set(packageIds)].filter(Number.isFinite);

  const [tests, packages] = await Promise.all([
    uniqueTestIds.length
      ? prisma.test.findMany({
          where: { id: { in: uniqueTestIds } },
          select: { id: true, name: true, reportWithin: true, reportUnit: true },
        })
      : [],
    uniquePackageIds.length
      ? prisma.healthPackage.findMany({
          where: { id: { in: uniquePackageIds } },
          select: { id: true, name: true, reportWithin: true, reportUnit: true },
        })
      : [],
  ]);

  return {
    testMap: new Map(tests.map((t) => [t.id, t])),
    pkgMap: new Map(packages.map((p) => [p.id, p])),
  };
};

// ─── Create member packages (tests + packages) ────────────────────────────────

const createMemberItems = async (orderId, members, orderDate, testMap, pkgMap) => {
  for (const m of members) {
    const orderMember = await prisma.orderMember.create({
      data: { orderId, patientId: m.patientId },
    });

    const rows = [];

    for (const pkgIdRaw of m.packages || []) {
      const pkgId = Number(pkgIdRaw);
      const pkg = pkgMap.get(pkgId);
      const unit = pkg?.reportUnit ? normalizeUnit(pkg.reportUnit) : null;

      rows.push({
        orderMemberId: orderMember.id,
        packageId: pkgId,
        reportWithin: pkg?.reportWithin ?? null,
        reportUnit: unit,
        reportDueAt: pkg ? computeDueAt(orderDate, pkg.reportWithin, unit) : null,
        dispatchStatus: "NOT_READY",
      });
    }

    for (const testIdRaw of m.tests || []) {
      const testId = Number(testIdRaw);
      const t = testMap.get(testId);
      const unit = t?.reportUnit ? normalizeUnit(t.reportUnit) : null;

      rows.push({
        orderMemberId: orderMember.id,
        testId,
        reportWithin: t?.reportWithin ?? null,
        reportUnit: unit,
        reportDueAt: t ? computeDueAt(orderDate, t.reportWithin, unit) : null,
        dispatchStatus: "NOT_READY",
      });
    }

    await prisma.orderMemberPackage.createMany({ data: rows });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: createOrder
// ─────────────────────────────────────────────────────────────────────────────

export const createOrder = async (req, res) => {
  let lock;

  try {
    const {
      source, addressId, patientId, totalAmount, discount, finalAmount,
      testType, date, doctorId, isSelf, members, paymentStatus,
      merchantOrderId, isHomeSample = false, slotId, centerId, centerSlotId,
    } = req.body;

    if (!members?.length) {
      return res.status(400).json({ error: "Members required" });
    }

    const orderDate = parseISTDateTime(date);
    if (isNaN(orderDate.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }

    // Slot validation
    if (isHomeSample && !slotId)
      return res.status(400).json({ error: "slotId is required for home sample" });
    if (!isHomeSample && !centerId)
      return res.status(400).json({ error: "centerId is required for center booking" });
    if (!isHomeSample && !centerSlotId)
      return res.status(400).json({ error: "centerSlotId is required for center booking" });

    const { testMap, pkgMap } = await fetchTestsAndPackages(members);

    const lockKey = isHomeSample
      ? `lock:slot:${slotId}:${dayjs(orderDate).format("YYYY-MM-DD")}`
      : `lock:centerSlot:${centerSlotId}:${dayjs(orderDate).format("YYYY-MM-DD")}`;

    lock = await acquireLock(lockKey);

    // ── Transaction ──────────────────────────────────────────────────────────
    const order = await prisma.$transaction(async (tx) => {
      if (isHomeSample) await bookSlotTx(tx, Number(slotId), orderDate);

      const created = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          source, addressId, patientId, totalAmount, discount, finalAmount,
          doctorId, isSelf, testType, date: orderDate,
          status: "pending",
          paymentStatus: paymentStatus || "pending",
          merchantOrderId,
          isHomeSample: Boolean(isHomeSample),
          slotId: isHomeSample ? Number(slotId) : null,
          centerId: isHomeSample ? null : Number(centerId),
          centerSlotId: isHomeSample ? null : Number(centerSlotId),
        },
      });

      const paymentId = `PAY-${Date.now()}`;
      await tx.payment.create({
        data: {
          orderId: created.id, patientId, paymentId,
          paymentMethod: "UPI", paymentMode: "ONLINE",
          paymentStatus: "COMPLETED", amount: finalAmount,
          currency: "INR", paymentDate: new Date(),
        },
      });

      await invoiceQueue.add("generate-invoice", { paymentId });
      return created;
    });

    await createMemberItems(order.id, members, orderDate, testMap, pkgMap);

    const isRadiology = String(testType || "").toUpperCase() === "RADIOLOGY";
    const isPathology = String(testType || "").toUpperCase() === "PATHOLOGY";

    if (!isRadiology) {
      const address = await prisma.address.findUnique({ where: { id: addressId } });
      const lat = Number(address.latitude);
      const lng = Number(address.longitude);
      const pincodeStr = String(address.pincode || "").trim();

      // Slot label
      let slotLabel = "";
      if (isHomeSample) {
        const slotData = await prisma.slot.findUnique({ where: { id: Number(slotId) } });
        slotLabel = slotData
          ? `${formatTimeIST(slotData.startTime)} - ${formatTimeIST(slotData.endTime)}`
          : "";
      } else {
        const cs = await prisma.centerSlot.findUnique({ where: { id: Number(centerSlotId) } });
        slotLabel = cs
          ? `${formatTimeIST(cs.startTime)} - ${formatTimeIST(cs.endTime)}`
          : "";
      }

      // Vendor notification
      await vendorNotificationQueue.add(
        "vendor-notifications",
        { orderId: order.id, pincode: pincodeStr, latitude: lat, longitude: lng, testType, radiusKm: 5 },
        { jobId: `vendor-new-order-${order.id}` },
      );

      // Redis indexing
      const dateKey = istDateKey(orderDate);
      const ttl = secondsToKeepForOrderDate(orderDate, 2);
      const { orderHash, pendingDateSet, pendingPincodeSet, orderGeo } = orderKeys({
        orderId: order.id, dateKey, pincode: pincodeStr,
      });

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

      await Promise.all([
        redis.sAdd(pendingDateSet, String(order.id)),
        redis.sAdd(pendingPincodeSet, String(order.id)),
        Number.isFinite(lng) && Number.isFinite(lat)
          ? redis.sendCommand(["GEOADD", orderGeo, String(lng), String(lat), String(order.id)])
          : Promise.resolve(),
        redis.expire(orderHash, ttl),
        redis.expire(pendingDateSet, ttl),
        redis.expire(pendingPincodeSet, ttl),
        redis.expire(orderGeo, ttl),
      ]);

      if (isPathology) {
        const io = req.app.get("io");
        if (io && isTodayIST(orderDate)) {
          await broadcastNewOrder(io, {
            id: order.id, date: orderDate, testType, radiusKm: 5, slot: slotLabel,
            address: { pincode: pincodeStr, latitude: lat, longitude: lng },
          });
        }
      }
    }

    // WhatsApp (fire & forget — after response)
    res.json({ success: true, orderId: order.id, orderNumber: order.orderNumber });

    await whatsappQueue.add(
      "whatsapp.sendOrderAndPayment",
      { orderId: order.id },
      { jobId: `whatsapp-orderpay-${order.id}`, removeOnComplete: true },
    );
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  } finally {
    if (lock?.release) await lock.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: createAdminOrder
// ─────────────────────────────────────────────────────────────────────────────

export const createAdminOrder = async (req, res) => {
  try {
    const {
      patientId, selectedTests,
      addressId, homeCollection = false,
      registrationType, provisionalDiagnosis, notes, remark, source,
      diagnosticCenterId, refCenterId, doctorId,
      centerId, collectionCenterId, slotId,
      totalAmount: bodyTotalAmount, discount, discountAmount,
      finalAmount: bodyFinalAmount,
      date, homeCollectionDate,
    } = req.body;

    if (!patientId || !Array.isArray(selectedTests) || selectedTests.length === 0) {
      return res.status(400).json({ success: false, message: "Patient & items required" });
    }

    if (Boolean(homeCollection)) {
      if (!castInt(addressId))
        return res.status(400).json({ success: false, message: "addressId is required for home collection" });
      if (!castInt(slotId))
        return res.status(400).json({ success: false, message: "slotId is required for home collection" });
    }

    // Order number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD${todayStr}` } },
    });
    const orderNumber = `ORD${todayStr}${String(count + 1).padStart(4, "0")}`;

    // Totals
    const computedTotal = selectedTests.reduce(
      (sum, t) => sum + toNumber(t?.price ?? t?.amount ?? t?.total), 0
    );
    const total = bodyTotalAmount != null ? toNumber(bodyTotalAmount) : computedTotal;
    const discountAmt =
      discountAmount != null ? toNumber(discountAmount) : discount != null ? toNumber(discount) : 0;
    const finalAmt =
      bodyFinalAmount != null ? toNumber(bodyFinalAmount) : Math.max(0, total - discountAmt);
    const isFreeOrder = Number(finalAmt) <= 0;

    const orderDate = parseISTDateTime(date || homeCollectionDate || null);

    // SLA maps
    const testIds = selectedTests
      .filter((i) => normalizeItemType(i) === "test")
      .map((i) => castInt(i?.id ?? i?.testId))
      .filter(Boolean);

    const packageIds = selectedTests
      .filter((i) => normalizeItemType(i) === "package")
      .map((i) => castInt(i?.id ?? i?.packageId))
      .filter(Boolean);

    const [tests, packages] = await Promise.all([
      testIds.length
        ? prisma.test.findMany({ where: { id: { in: testIds } }, select: { id: true, reportWithin: true, reportUnit: true } })
        : [],
      packageIds.length
        ? prisma.healthPackage.findMany({ where: { id: { in: packageIds } }, select: { id: true, reportWithin: true, reportUnit: true } })
        : [],
    ]);

    const testMap = new Map(tests.map((t) => [t.id, t]));
    const pkgMap = new Map(packages.map((p) => [p.id, p]));

    // Build order payload
    const dataToCreate = {
      orderNumber,
      createdBy: { connect: { id: castInt(req.user?.id) } },
      patient: { connect: { id: castInt(patientId) } },
      orderType: registrationType ?? null,
      ...(castInt(diagnosticCenterId)
        ? { diagnosticCenter: { connect: { id: castInt(diagnosticCenterId) } } }
        : {}),
      totalAmount: Number(total),
      discount: Number(discountAmt) || 0,
      discountAmount: Number(discountAmt),
      finalAmount: Number(finalAmt),
      paymentStatus: isFreeOrder ? "PAID" : "PENDING",
      source: source ?? undefined,
      date: orderDate,
      isHomeSample: Boolean(homeCollection),
      remarks: [provisionalDiagnosis, notes, remark].filter(Boolean).join(" | "),
    };

    const sId = castInt(slotId);
    if (sId) dataToCreate.slot = { connect: { id: sId } };

    if (Boolean(homeCollection)) {
      const addr = castInt(addressId);
      if (addr) dataToCreate.address = { connect: { id: addr } };
    } else {
      const finalCenterId = castInt(centerId ?? collectionCenterId);
      if (finalCenterId) dataToCreate.center = { connect: { id: finalCenterId } };
    }

    const dId = castInt(doctorId);
    if (dId) dataToCreate.doctor = { connect: { id: dId } };

    const rId = castInt(refCenterId);
    if (rId) dataToCreate.refCenter = { connect: { id: rId } };

    // ── Transaction ──────────────────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: dataToCreate });

      const orderMember = await tx.orderMember.create({
        data: { orderId: order.id, patientId: castInt(patientId) },
      });

      if (isFreeOrder) {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } }).catch(() => {});
        await tx.payment.create({
          data: {
            orderId: order.id, amount: 0, status: "paid",
            paymentMethod: "Discount", providerRef: `FREE-${order.orderNumber}`,
            createdById: castInt(req.user?.id) || null,
            note: "Auto paid (finalAmount = 0)",
          },
        }).catch(() => {});
      }

      await Promise.all(
        selectedTests.map((item) => {
          const id = castInt(item?.id ?? item?.testId ?? item?.packageId);
          const type = normalizeItemType(item);
          const src = type === "test" ? testMap.get(id) : pkgMap.get(id);
          const unit = src?.reportUnit ? normalizeUnit(src.reportUnit) : null;

          return tx.orderMemberPackage.create({
            data: {
              orderMemberId: orderMember.id,
              testId: type === "test" ? id : null,
              packageId: type === "package" ? id : null,
              reportWithin: src?.reportWithin ?? null,
              reportUnit: unit,
              reportDueAt: src ? computeDueAt(orderDate, src.reportWithin, unit) : null,
              dispatchStatus: "NOT_READY",
            },
          });
        })
      );

      return { orderId: order.id };
    });

    const createdOrder = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: {
        patient: true, address: true, doctor: true, refCenter: true,
        center: true, slot: true,
        orderMembers: {
          include: { orderMemberPackages: { include: { test: true, package: true } } },
        },
      },
    });

    // WhatsApp (non-blocking)
    whatsappQueue.add(
      "whatsapp.sendOrderConfirmed",
      { orderId: result.orderId },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: true, removeOnFail: false },
    ).catch((e) => console.warn("WhatsApp queue failed:", e?.message));

    return res.json({ success: true, message: "Order created successfully", order: createdOrder });
  } catch (error) {
    console.error("Create admin order error:", error);
    return res.status(500).json({ success: false, message: "Order failed", error: error.message });
  }
};