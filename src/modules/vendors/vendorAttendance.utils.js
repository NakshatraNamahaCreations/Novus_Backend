import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(timezone);

export const IST = "Asia/Kolkata";

// ✅ Date object (IST start-of-day) for Prisma
export const istDayStart = (d = new Date()) =>
  dayjs(d).tz(IST).startOf("day").toDate();

// ✅ String only for filenames / keys
export const istDayKey = (d = new Date()) =>
  dayjs(d).tz(IST).format("YYYY-MM-DD");
