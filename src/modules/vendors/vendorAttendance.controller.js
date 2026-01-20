import { PrismaClient } from "@prisma/client";
import { uploadBufferToS3 } from "../../config/s3.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();
const IST = "Asia/Kolkata";

/* -----------------------------
   ✅ Helpers
----------------------------- */

// Date object at IST start-of-day (safe for Prisma DateTime/@db.Date)
const istDayStart = (d = new Date()) => dayjs(d).tz(IST).startOf("day").toDate();

// String (only for S3 key naming)
const istDayKey = (d = new Date()) => dayjs(d).tz(IST).format("YYYY-MM-DD");

// S3 key
const buildSelfieKey = (vendorId, now = new Date()) => {
  const d = istDayKey(now);
  return `attendance/vendor-${vendorId}/${d}/checkin.jpg`;
};

// number safe
const toNumOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ==========================================================
   ✅ POST /vendors/attendance/checkin
   multipart/form-data: selfie(file), lat, lng
========================================================== */
export const vendorCheckIn = async (req, res) => {
  try {
    const vendorId = Number(req.user?.vendorId ?? req.user?.id);
    if (!vendorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // selfie is required (multer memoryStorage)
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Selfie is required (field name: selfie)",
      });
    }

    const now = new Date();
    const day = istDayStart(now); // ✅ Date object (NOT string)

    // ✅ block multiple check-in same day
    const existing = await prisma.vendorAttendance.findUnique({
      where: { vendorId_day: { vendorId, day } },
      select: { id: true, checkInAt: true, selfieKey: true },
    });

    if (existing?.checkInAt) {
      return res.status(400).json({
        success: false,
        message: "Already checked-in today",
      });
    }

    // ✅ upload selfie
    const key = buildSelfieKey(vendorId, now);
    const selfieUrl = await uploadBufferToS3({
      buffer: req.file.buffer,
      key,
      contentType: req.file.mimetype || "image/jpeg",
    });

    const lat = toNumOrNull(req.body.lat);
    const lng = toNumOrNull(req.body.lng);

    // ✅ upsert attendance row (one per vendor per day)
    const row = await prisma.vendorAttendance.upsert({
      where: { vendorId_day: { vendorId, day } },
      create: {
        vendorId,
        day,
        status: "PRESENT",
        checkInAt: now,
        selfieUrl,
        selfieKey: key,
        lat,
        lng,
      },
      update: {
        status: "PRESENT",
        checkInAt: now,
        selfieUrl,
        selfieKey: key,
        lat,
        lng,
        selfieDeletedAt: null,
      },
    });

    return res.json({
      success: true,
      message: "Check-in successful",
      attendance: row,
    });
  } catch (err) {
    console.error("vendorCheckIn error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Check-in failed",
    });
  }
};

/* ==========================================================
   ✅ GET /vendors/attendance/monthly?year=2026&month=1
   returns how many days vendor checked in that month
========================================================== */
export const vendorMonthlyAttendance = async (req, res) => {
  try {
    const vendorId = Number(req.user?.vendorId ?? req.user?.id);
    if (!vendorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1..12

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Valid year and month (1..12) required",
      });
    }

    const start = dayjs
      .tz(`${year}-${String(month).padStart(2, "0")}-01`, IST)
      .startOf("month")
      .toDate();

    const end = dayjs(start).add(1, "month").toDate();

    // ✅ get all present days rows
    const presentRows = await prisma.vendorAttendance.findMany({
      where: {
        vendorId,
        day: { gte: start, lt: end },
        checkInAt: { not: null },
      },
      select: {
        id: true,
        day: true,
        checkInAt: true,
        status: true,
        selfieUrl: true,
        lat: true,
        lng: true,
      },
      orderBy: { day: "asc" },
    });

    // ✅ count
    const presentDays = presentRows.length;

    // ✅ format for UI
    const presentDaysList = presentRows.map((r) => ({
      id: r.id,
      day: r.day, // Date
      dayIST: dayjs(r.day).tz(IST).format("YYYY-MM-DD"),
      checkInAt: r.checkInAt,
      checkInAtIST: r.checkInAt ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD hh:mm A") : null,
      status: r.status,
      selfieUrl: r.selfieUrl,
      lat: r.lat,
      lng: r.lng,
    }));

    return res.json({
      success: true,
      vendorId,
      year,
      month,
      presentDays,
      presentDaysList, // ✅ full object list
    });
  } catch (err) {
    console.error("vendorMonthlyAttendance error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Monthly report failed",
    });
  }
};


/* ==========================================================
   ✅ GET /vendors/attendance/today
   show today's attendance row (optional, useful for UI)
========================================================== */
export const vendorTodayAttendance = async (req, res) => {
  try {
    const vendorId = Number(req.user?.vendorId ?? req.user?.id);
    if (!vendorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const day = istDayStart(new Date());

    const row = await prisma.vendorAttendance.findUnique({
      where: { vendorId_day: { vendorId, day } },
    });

    return res.json({ success: true, attendance: row });
  } catch (err) {
    console.error("vendorTodayAttendance error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminVendorMonthlyAttendance = async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId || req.query.vendorId);
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1..12

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: "Valid year and month required" });
    }

    const start = dayjs
      .tz(`${year}-${String(month).padStart(2, "0")}-01`, IST)
      .startOf("month")
      .toDate();

    const end = dayjs(start).add(1, "month").toDate();

    const rows = await prisma.vendorAttendance.findMany({
      where: {
        vendorId,
        day: { gte: start, lt: end },
        checkInAt: { not: null },
      },
      select: {
        id: true,
        day: true,
        checkInAt: true,
        status: true,
        selfieUrl: true,
        lat: true,
        lng: true,
      },
      orderBy: { day: "asc" },
    });

    return res.json({
      success: true,
      vendorId,
      year,
      month,
      presentDays: rows.length,
      presentDaysList: rows.map((r) => ({
        id: r.id,
        day: r.day,
        dayIST: dayjs(r.day).tz(IST).format("YYYY-MM-DD"),
        checkInAt: r.checkInAt,
        checkInAtIST: r.checkInAt ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD hh:mm A") : null,
        status: r.status,
        selfieUrl: r.selfieUrl,
        lat: r.lat,
        lng: r.lng,
      })),
    });
  } catch (err) {
    console.error("adminVendorMonthlyAttendance error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

