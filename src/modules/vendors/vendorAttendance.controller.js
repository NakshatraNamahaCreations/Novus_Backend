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

// ✅ IMPORTANT FIX:
// Your DB `day` column is Postgres `date` (no time).
// To store the correct IST calendar date in a `date` column,
// always store it as UTC-midnight of the IST date.
const istDateForDbDateColumn = (d = new Date()) => {
  const t = dayjs(d).tz(IST);
  return new Date(Date.UTC(t.year(), t.month(), t.date())); // 00:00:00Z
};

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

// ✅ Month range (for DB `date` column) using IST calendar month boundaries
// Stored as UTC-midnight dates, end is exclusive
const istMonthRangeForDbDateColumn = (year, month) => {
  const startTz = dayjs.tz(
    `${year}-${String(month).padStart(2, "0")}-01`,
    IST
  );
  const start = new Date(
    Date.UTC(startTz.year(), startTz.month(), startTz.date())
  );

  const endTz = startTz.add(1, "month");
  const end = new Date(Date.UTC(endTz.year(), endTz.month(), endTz.date()));

  return { start, end };
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

    // ✅ FIX: correct day storage for Postgres `date`
    const day = istDateForDbDateColumn(now);

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

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid year and month (1..12) required",
      });
    }

    // ✅ FIX: month boundaries that match how `day` is stored
    const { start, end } = istMonthRangeForDbDateColumn(year, month);

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

    const presentDays = presentRows.length;

    const presentDaysList = presentRows.map((r) => ({
      id: r.id,
      day: r.day,

      // ✅ show correct IST day for UI
      // - prefer checkInAt (actual timestamp)
      // - fallback to stored day (stored as UTC midnight already)
      dayIST: r.checkInAt
        ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD")
        : dayjs(r.day).utc().format("YYYY-MM-DD"),

      checkInAt: r.checkInAt,
      checkInAtIST: r.checkInAt
        ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD hh:mm A")
        : null,

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
      presentDaysList,
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
========================================================== */
export const vendorTodayAttendance = async (req, res) => {
  try {
    const vendorId = Number(req.user?.vendorId ?? req.user?.id);
    if (!vendorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // ✅ FIX: day must be computed the same way as stored
    const day = istDateForDbDateColumn(new Date());

    const row = await prisma.vendorAttendance.findUnique({
      where: { vendorId_day: { vendorId, day } },
    });

    return res.json({ success: true, attendance: row });
  } catch (err) {
    console.error("vendorTodayAttendance error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ==========================================================
   ✅ GET /admin/vendors/:vendorId/attendance/monthly?year=2026&month=1
========================================================== */
export const adminVendorMonthlyAttendance = async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId || req.query.vendorId);
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "vendorId required" });
    }
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Valid year and month required" });
    }

    // ✅ FIX: month boundaries that match how `day` is stored
    const { start, end } = istMonthRangeForDbDateColumn(year, month);

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

        // ✅ FIX: admin API should also show correct IST date
        dayIST: r.checkInAt
          ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD")
          : dayjs(r.day).utc().format("YYYY-MM-DD"),

        checkInAt: r.checkInAt,
        checkInAtIST: r.checkInAt
          ? dayjs(r.checkInAt).tz(IST).format("YYYY-MM-DD hh:mm A")
          : null,
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
