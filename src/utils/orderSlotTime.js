import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

const IST_TZ = "Asia/Kolkata";


export const buildOrderSlotWindow = (orderDate, slotStartTime, slotEndTime, tz = IST_TZ) => {
  const orderDayIST = dayjs(orderDate).tz(tz).startOf("day");

  const startISTTime = dayjs(slotStartTime).tz(tz);
  const endISTTime = dayjs(slotEndTime).tz(tz);

  const startIST = orderDayIST
    .hour(startISTTime.hour())
    .minute(startISTTime.minute())
    .second(0)
    .millisecond(0);

  const endIST = orderDayIST
    .hour(endISTTime.hour())
    .minute(endISTTime.minute())
    .second(0)
    .millisecond(0);

  return {
    startIST,
    endIST,
    startUTC: startIST.utc().toDate(),
    endUTC: endIST.utc().toDate(),
  };
};

export const isOrderExpiringSoonOrOverdue = ({
  nowIST,
  startIST,
  minutesBefore = 30,
}) => {
  const threshold = startIST.subtract(minutesBefore, "minute");
  // now >= (start - 30 mins)  => includes during slot + overdue
  return nowIST.isSameOrAfter(threshold);
};

export const IST_TIMEZONE = IST_TZ;