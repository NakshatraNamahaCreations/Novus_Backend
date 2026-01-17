
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

export const IST_TZ = "Asia/Kolkata";

export function istDateKey(d) {
  return dayjs(d).tz(IST_TZ).format("YYYY-MM-DD");
}

export function isTodayIST(d) {
  const nowKey = istDateKey(new Date());
  const dKey = istDateKey(d);
  return nowKey === dKey;
}

export function secondsToKeepForOrderDate(d, extraDays = 2) {
  // keep until end of order day + buffer (default 2 days)
  const endOfDay = dayjs(d).tz(IST_TZ).endOf("day");
  const now = dayjs().tz(IST_TZ);
  const diff = endOfDay.diff(now, "second");
  const buffer = extraDays * 24 * 60 * 60;
  return Math.max(60 * 60, diff + buffer); // minimum 1 hour
}

export function orderKeys({ orderId, dateKey, pincode }) {
  const orderHash = `order:${orderId}`;
  const pendingDateSet = `orders:pending:date:${dateKey}`;
  const pendingPincodeSet = `orders:pending:date:${dateKey}:pincode:${pincode}`;
  const orderGeo = `orders:geo:date:${dateKey}`;
  return { orderHash, pendingDateSet, pendingPincodeSet, orderGeo };
}
