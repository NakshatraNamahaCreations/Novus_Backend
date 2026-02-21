// utils/timezone.js
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

export const IST_TZ = "Asia/Kolkata";

/**
 * Converts a UTC date/time (Date | ISO string | Prisma DateTime) to IST dayjs instance
 */
export const toIST = (date) => {
  try {
    if (!date) return null;
    return dayjs.utc(date).tz(IST_TZ);
  } catch (e) {
    return null;
  }
};

/**
 * Formats a UTC date/time into IST time string like "07:30 PM"
 */
export const formatTimeIST = (date, fmt = "hh:mm A") => {
  try {
    const d = toIST(date);
    return d ? d.format(fmt) : "";
  } catch (e) {
    return "";
  }
};

/**
 * ✅ Returns IST date-only string "YYYY-MM-DD" from a UTC date/time
 */
export const toISTDateOnly = (date, fmt = "YYYY-MM-DD") => {
  try {
    const d = toIST(date);
    return d ? d.format(fmt) : "";
  } catch (e) {
    return "";
  }
};

/**
 * ✅ Convert an IST date string ("YYYY-MM-DD") to a UTC JS Date at IST midnight
 * Useful if you need the exact UTC instant for an IST boundary.
 */
export const istStartToUTCDate = (yyyy_mm_dd) => {
  try {
    if (!yyyy_mm_dd) return null;
    return dayjs.tz(yyyy_mm_dd, IST_TZ).startOf("day").toDate();
  } catch (e) {
    return null;
  }
};

/**
 * ✅ Prisma-friendly IST Day Range:
 * input: "2026-02-21"
 * output: { gte: Date(IST start -> UTC), lt: Date(next day IST start -> UTC) }
 */
export const getISTDayRange = (yyyy_mm_dd) => {
  try {
    if (!yyyy_mm_dd) return null;
    const start = dayjs.tz(yyyy_mm_dd, IST_TZ).startOf("day");
    const end = start.add(1, "day"); // next-day start (exclusive)
    return { gte: start.toDate(), lt: end.toDate() };
  } catch (e) {
    return null;
  }
};

/**
 * ✅ Prisma-friendly IST Date Range (inclusive-to):
 * input: from="2026-02-01", to="2026-02-21"
 * output: { gte: from IST start, lt: (to IST start + 1 day) }
 */
export const getISTDateRange = (from, to) => {
  try {
    if (!from || !to) return null;
    const start = dayjs.tz(from, IST_TZ).startOf("day");
    const end = dayjs.tz(to, IST_TZ).startOf("day").add(1, "day");
    return { gte: start.toDate(), lt: end.toDate() };
  } catch (e) {
    return null;
  }
};

/**
 * ✅ Prisma-friendly IST Month Range:
 * input: "2026-02"
 * output: { gte: Feb 1 IST start, lt: Mar 1 IST start }
 */
export const getISTMonthRange = (yyyy_mm) => {
  try {
    if (!yyyy_mm) return null;
    const start = dayjs.tz(`${yyyy_mm}-01`, IST_TZ).startOf("month");
    const end = start.add(1, "month");
    return { gte: start.toDate(), lt: end.toDate() };
  } catch (e) {
    return null;
  }
};