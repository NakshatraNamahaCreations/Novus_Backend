// utils/timezone.js
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

const IST_TZ = "Asia/Kolkata";

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