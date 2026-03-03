// ─── order.helpers.js ────────────────────────────────────────────────────────
// Shared pure utility functions used across order controllers.
// No DB calls, no express req/res — keep it that way.
// ─────────────────────────────────────────────────────────────────────────────

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";
import { getISTDayRange, getISTDateRange, getISTMonthRange } from "../../utils/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

// ─── Unit normalisation ───────────────────────────────────────────────────────

export const normalizeUnit = (u = "") => {
  const unit = String(u || "").toLowerCase().trim();
  if (["min", "mins", "minute", "minutes"].includes(unit)) return "minutes";
  if (["hr", "hrs", "hour", "hours"].includes(unit)) return "hours";
  if (["day", "days"].includes(unit)) return "days";
  return unit;
};

// ─── Due-date calculator ──────────────────────────────────────────────────────

export const computeDueAt = (baseDate, within, unit) => {
  const w = Number(within || 0);
  if (!w) return null;

  const d = new Date(baseDate);
  if (unit === "minutes") d.setMinutes(d.getMinutes() + w);
  else if (unit === "hours") d.setHours(d.getHours() + w);
  else if (unit === "days") d.setDate(d.getDate() + w);
  else throw new Error(`Invalid reportUnit: ${unit}`);

  return d;
};

// ─── IST date parser ──────────────────────────────────────────────────────────

export const parseISTDateTime = (v) => {
  if (!v) return new Date();
  const s = String(v).trim();
  const withTime = s.length === 10 ? `${s} 09:00` : s;
  return dayjs.tz(withTime, "Asia/Kolkata").toDate();
};

// ─── Excel helpers ────────────────────────────────────────────────────────────

export const formatExcelDateTime = (d) => {
  if (!d) return "";
  return dayjs(d).format("DD/MM/YYYY HH:mm");
};

export const buildLabTestsText = (order) => {
  const names = new Set();

  for (const oc of order.orderCheckups || []) {
    if (oc?.checkup?.name) names.add(oc.checkup.name);
  }

  for (const om of order.orderMembers || []) {
    for (const omp of om.orderMemberPackages || []) {
      if (omp?.test?.name) names.add(omp.test.name);
      if (omp?.package?.name) names.add(omp.package.name);
    }
  }

  return Array.from(names).join(", ");
};

// ─── Report WHERE builder (reused by getOrderReports + exportExcel) ───────────

export function buildOrderReportWhere(query) {
  try {
    const {
      date,
      fromDate,
      toDate,
      month,
      dateField = "date",
      centerId,
      refCenterId,
      doctorId,
      diagnosticCenterId,
      status,
      source,
      city,
      pincode,
      orderId,
    } = query;

    const where = {};

    if (orderId && String(orderId).trim()) {
      const idNum = Number(String(orderId).replace(/\D/g, ""));
      if (!Number.isNaN(idNum) && idNum > 0) where.id = idNum;
    }

    const dateKey = String(dateField) === "createdAt" ? "createdAt" : "date";

    if (fromDate && toDate && String(fromDate).trim() && String(toDate).trim()) {
      const range = getISTDateRange(fromDate, toDate);
      if (range) where[dateKey] = range;
    } else if (month && String(month).trim()) {
      const range = getISTMonthRange(month);
      if (range) where[dateKey] = range;
    } else if (date && String(date).trim()) {
      const range = getISTDayRange(date);
      if (range) where[dateKey] = range;
    }

    if (centerId) where.centerId = Number(centerId);
    if (refCenterId) where.refCenterId = Number(refCenterId);
    if (doctorId) where.doctorId = Number(doctorId);
    if (diagnosticCenterId) where.diagnosticCenterId = Number(diagnosticCenterId);
    if (status) where.status = status;
    if (source) where.source = source;

    if ((city && city.trim()) || (pincode && pincode.trim())) {
      const c = city?.trim();
      const p = pincode?.trim();

      where.OR = [
        {
          address: {
            ...(c ? { city: { contains: c, mode: "insensitive" } } : {}),
            ...(p ? { pincode: { contains: p, mode: "insensitive" } } : {}),
          },
        },
        {
          center: {
            ...(p ? { pincode: { contains: p, mode: "insensitive" } } : {}),
            ...(c ? { city: { name: { contains: c, mode: "insensitive" } } } : {}),
          },
        },
      ];
    }

    return where;
  } catch (err) {
    console.error("buildOrderReportWhere error:", err);
    return {};
  }
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

/** Safe integer cast — returns null for blanks/NaN */
export const castInt = (v) =>
  v === undefined || v === null || v === "" || Number.isNaN(Number(v))
    ? null
    : Number(v);

/** Safe number — returns 0 for blanks/NaN */
export const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Normalise "package" | "checkup" → "package", everything else → "test" */
export const normalizeItemType = (t) => {
  const type = String(t?.type || "").toLowerCase();
  if (type === "package" || type === "checkup") return "package";
  return "test";
};