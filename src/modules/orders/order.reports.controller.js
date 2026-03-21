// ─── order.reports.controller.js ─────────────────────────────────────────────
// Handles: getOrderReports, exportOrderReportsExcel, fetchReportDue,
//          getOrdersExpiringSoon
// ─────────────────────────────────────────────────────────────────────────────


import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";
import ExcelJS from "exceljs";

import {
  buildOrderReportWhere,
  formatExcelDateTime,
  buildLabTestsText,
} from "./order.helpers.js";
import {
  buildOrderSlotWindow,
  isOrderExpiringSoonOrOverdue,
  IST_TIMEZONE,
} from "../../utils/orderSlotTime.js";
import { getISTDayRange, getISTDateRange, getISTMonthRange } from "../../utils/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

import prisma from '../../lib/prisma.js';

// ─── Shared Prisma include for report queries ─────────────────────────────────

const REPORT_INCLUDE = {
  patient: { select: { id: true, fullName: true, contactNo: true } },
  address: { select: { id: true, city: true, state: true, pincode: true, address: true } },
  center: {
    select: {
      id: true, name: true, address: true, mobile: true, contactName: true, pincode: true,
      city: { select: { id: true, name: true } },
    },
  },
  slot: { select: { id: true, startTime: true, endTime: true } },
  centerSlot: { select: { id: true, startTime: true, endTime: true } },
  refCenter: { select: { id: true, name: true } },
  doctor: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  diagnosticCenter: { select: { id: true, name: true } },
  orderCheckups: { include: { checkup: { select: { id: true, name: true } } } },
  orderMembers: {
    include: {
      patient: { select: { fullName: true } },
      orderMemberPackages: {
        include: { package: true, test: { select: { id: true, name: true } } },
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORDER REPORTS (paginated)
// ─────────────────────────────────────────────────────────────────────────────

export const getOrderReports = async (req, res) => {
  try {
    let { page = 1, limit = 25, ...filterQuery } = req.query;
    page = Number(page) || 1;
    limit = Number(limit) || 25;

    const where = buildOrderReportWhere(filterQuery);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: REPORT_INCLUDE,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return res.json({
      success: true, page, limit, total,
      totalPages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    console.error("Order report error:", error);
    return res.status(500).json({ error: "Failed to fetch order reports" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT EXCEL
// ─────────────────────────────────────────────────────────────────────────────

export const exportOrderReportsExcel = async (req, res) => {
  try {
    const where = buildOrderReportWhere(req.query);

    const orders = await prisma.order.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, contactNo: true, age: true, gender: true } },
        address: { select: { city: true, state: true, pincode: true, address: true } },
        center: {
          select: { name: true, mobile: true, pincode: true, city: { select: { name: true } } },
        },
        refCenter: { select: { name: true } },
        doctor: { select: { name: true } },
        orderCheckups: { include: { checkup: { select: { name: true } } } },
        orderMembers: {
          include: {
            orderMemberPackages: {
              include: { package: true, test: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { id: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Order Report");

    ws.columns = [
      { header: "Sl.No",        key: "sl",          width: 6  },
      { header: "Reg",          key: "reg",         width: 12 },
      { header: "Lab no",       key: "labNo",       width: 10 },
      { header: "source",       key: "source",      width: 14 },
      { header: "Date",         key: "date",        width: 18 },
      { header: "Patient Name", key: "patientName", width: 22 },
      { header: "Age",          key: "age",         width: 8  },
      { header: "Gender",       key: "gender",      width: 10 },
      { header: "Mobile No.",   key: "mobile",      width: 14 },
      { header: "Lab Tests",    key: "labTests",    width: 35 },
      { header: "Ref.Doctor",   key: "refDoctor",   width: 18 },
      { header: "Ref.Center",   key: "refCenter",   width: 18 },
      { header: "Bill No.",     key: "billNo",      width: 10 },
      { header: "Bill Type",    key: "billType",    width: 12 },
      { header: "Paid / Due",   key: "paidDue",     width: 10 },
      { header: "Amount",       key: "amount",      width: 10 },
      { header: "Discount",     key: "discount",    width: 10 },
      { header: "Paid",         key: "paid",        width: 10 },
      { header: "Due",          key: "due",         width: 10 },
      { header: "Refund",       key: "refund",      width: 10 },
      { header: "Payment Type", key: "paymentType", width: 20 },
    ];

    ws.getRow(1).font = { bold: true };

    orders.forEach((o, idx) => {
      const amount     = Number(o.finalAmount || 0);
      const paidAmount = o.paymentStatus === "paid" ? amount : Number(o.paidAmount || 0);
      const dueAmount  = Math.max(0, amount - paidAmount);
      const discount   = Number(o.discountAmount ?? o.discount ?? 0);
      const refund     = Number(o.refundAmount || 0);

      ws.addRow({
        sl:          idx + 1,
        reg:         o.patientId ? String(o.patientId) : "",
        labNo:       o.orderNumber ? String(o.orderNumber) : "",
        source:      o.source ?? "",
        date:        formatExcelDateTime(o.date),
        patientName: o.patient?.fullName || "",
        age:         o.patient?.age ? String(o.patient.age) : "",
        gender:      o.patient?.gender || "",
        mobile:      o.patient?.contactNo || "",
        labTests:    buildLabTestsText(o),
        refDoctor:   o.doctor?.name || "",
        refCenter:   o.refCenter?.name || "",
        billNo:      o.orderNumber ? String(o.orderNumber) : "",
        billType:    o.paymentMode || o.paymentMethod || "",
        paidDue:     o.paymentStatus === "paid" ? "paid" : "due",
        amount, discount, paid: paidAmount, due: dueAmount, refund,
        paymentType: o.paymentMethod || o.paymentMode || "",
      });
    });

    const fileName = `order-report-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel export error:", error);
    return res.status(500).json({ error: "Failed to export excel" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS EXPIRING SOON
// ─────────────────────────────────────────────────────────────────────────────

export const getOrdersExpiringSoon = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const nowIST = dayjs().tz(IST_TIMEZONE);

    const candidates = await prisma.order.findMany({
      where: { vendorId: null, status: "pending", isHomeSample: true },
      include: {
        patient: { select: { id: true, fullName: true, contactNo: true } },
        address: true,
        slot: true,
      },
      orderBy: { date: "asc" },
    });

    const filtered = candidates
      .filter((o) => {
        if (!o?.slot?.startTime || !o?.slot?.endTime) return false;
        const { startIST } = buildOrderSlotWindow(o.date, o.slot.startTime, o.slot.endTime);
        return isOrderExpiringSoonOrOverdue({ nowIST, startIST, minutesBefore: 30 });
      })
      .sort((a, b) => {
        const aw = buildOrderSlotWindow(a.date, a.slot.startTime, a.slot.endTime);
        const bw = buildOrderSlotWindow(b.date, b.slot.startTime, b.slot.endTime);
        return aw.startUTC.getTime() - bw.startUTC.getTime();
      });

    const total = filtered.length;
    const paged = filtered.slice(skip, skip + limitNum);

    return res.json({
      success: true, orders: paged, total,
      page: pageNum, limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      filteredCount: paged.length,
      nowIST: nowIST.format(),
    });
  } catch (error) {
    console.error("Expiring orders error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch expiring orders", error: error?.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH REPORT DUE (overdue + due-soon tabs)
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_DUE_INCLUDE = {
  test: { select: { id: true, name: true } },
  package: { select: { id: true, name: true } },
  orderMember: {
    include: {
      patient: { select: { id: true, fullName: true, contactNo: true } },
      order: {
        include: {
          createdBy: { select: { id: true, name: true, email: true, phone: true, role: true } },
          payments: {
            orderBy: { paymentDate: "desc" },
            include: {
              createdBy: { select: { id: true, name: true, email: true, phone: true, role: true } },
            },
          },
        },
      },
    },
  },
};

const mapReportDueRow = (now) => (x) => {
  const dueAt  = x.reportDueAt ? new Date(x.reportDueAt) : null;
  const diffMs = dueAt ? dueAt.getTime() - now.getTime() : null;
  const diffMin = diffMs != null ? Math.ceil(diffMs / 60000) : null;
  const order  = x.orderMember?.order || null;

  return {
    id: x.id,
    dispatchStatus: x.dispatchStatus,
    itemType: x.testId ? "TEST" : "PACKAGE",
    item: x.testId ? x.test : x.package,
    dispatchedAt: x.dispatchedAt,
    reportDueAt: dueAt,
    reportDueAtIST: dueAt ? dayjs(dueAt).tz("Asia/Kolkata").format("YYYY-MM-DD hh:mm A") : null,
    minutesLeft: diffMin,
    order: order
      ? {
          id: order.id, orderNumber: order.orderNumber, date: order.date,
          testType: order.testType, status: order.status,
          isHomeSample: order.isHomeSample, reportReady: order.reportReady,
          createdAt: order.createdAt, updatedAt: order.updatedAt, createdBy: order.createdBy || null,
        }
      : null,
    payments:
      order?.payments?.map((p) => ({
        id: p.id, paymentId: p.paymentId, paymentMethod: p.paymentMethod,
        paymentMode: p.paymentMode, paymentStatus: p.paymentStatus,
        amount: p.amount, currency: p.currency, paymentDate: p.paymentDate,
        transactionNote: p.transactionNote, referenceId: p.referenceId,
        invoiceUrl: p.invoiceUrl, capturedAmount: p.capturedAmount,
        refundAmount: p.refundAmount, refundDate: p.refundDate,
        refundReason: p.refundReason, refundReference: p.refundReference,
        createdAt: p.createdAt, updatedAt: p.updatedAt, createdBy: p.createdBy || null,
      })) ?? [],
    patient: x.orderMember?.patient || null,
  };
};

export const fetchReportDue = async (req, res) => {
  try {
    const beforeMin = Number(req.query.beforeMin ?? 10);
    const page      = Math.max(1, Number(req.query.page ?? 1));
    const pageSize  = Math.max(1, Number(req.query.pageSize ?? 10));
    const tab       = String(req.query.tab ?? "overdue");

    const now     = new Date();
    const soonEnd = new Date(now.getTime() + beforeMin * 60 * 1000);

    const whereDueSoon = { reportDueAt: { gte: now, lte: soonEnd } };
    const whereOverdue = { reportDueAt: { lt: now } };

    const [totalDueSoon, totalOverdue] = await Promise.all([
      prisma.orderMemberPackage.count({ where: whereDueSoon }),
      prisma.orderMemberPackage.count({ where: whereOverdue }),
    ]);

    const skip    = (page - 1) * pageSize;
    const isDueSoon = tab === "dueSoon";
    const total   = isDueSoon ? totalDueSoon : totalOverdue;

    const rows = await prisma.orderMemberPackage.findMany({
      where: isDueSoon ? whereDueSoon : whereOverdue,
      include: REPORT_DUE_INCLUDE,
      orderBy: { reportDueAt: isDueSoon ? "asc" : "desc" },
      skip,
      take: pageSize,
    });

    return res.json({
      success: true,
      nowUTC: now.toISOString(),
      nowIST: dayjs(now).tz("Asia/Kolkata").format("YYYY-MM-DD hh:mm A"),
      window: {
        beforeMin,
        soonEndUTC: soonEnd.toISOString(),
        soonEndIST: dayjs(soonEnd).tz("Asia/Kolkata").format("YYYY-MM-DD hh:mm A"),
      },
      totals: { overdue: totalOverdue, dueSoon: totalDueSoon },
      pagination: {
        tab, page, pageSize, total,
        totalPages: Math.ceil(total / pageSize),
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / pageSize),
      },
      data: rows.map(mapReportDueRow(now)),
    });
  } catch (err) {
    console.error("fetchReportDue error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

import { generateSingleTestPdf } from "../../services/pdf-generator/main.js";

export const downloadSingleTestPdf = async (req, res) => {
  try {
    const { orderId, patientId, testResultId } = req.params;
    const { variant = "letterhead" } = req.query; // 'plain' or 'letterhead'

    if (!orderId || !patientId || !testResultId) {
      return res.status(400).json({ success: false, message: "Missing required parameters" });
    }
    
    // Generate pdf buffer
    const pdfBuffer = await generateSingleTestPdf({
      orderId: Number(orderId),
      patientId: Number(patientId),
      testResultId: Number(testResultId),
      variant: variant === "plain" ? "plain" : "letterhead"
    });

    const filename = `test-report-${testResultId}-${variant}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("downloadSingleTestPdf error:", err);
    return res.status(500).json({ success: false, error: "Failed to generate single test PDF" });
  }
};