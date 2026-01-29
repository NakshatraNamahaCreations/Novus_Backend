import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();
const TZ = "Asia/Kolkata";

/** Display time in IST */
const formatTime = (d) => dayjs(d).tz(TZ).format("hh:mm A");
const formatIST = (d) => dayjs(d).tz(TZ).format("YYYY-MM-DD hh:mm A");

/** Build IST day range => UTC dates for DB queries */
const istDayRangeUtc = (dateStr /* YYYY-MM-DD */) => {
  const start = dayjs.tz(`${dateStr} 00:00`, "YYYY-MM-DD HH:mm", TZ);
  if (!start.isValid()) return null;
  return {
    startUtc: start.toDate(),
    endUtc: start.add(1, "day").toDate(),
  };
};

/* ----------------------------------------
   CREATE SLOT
---------------------------------------- */
export const createSlot = async (req, res) => {
  try {
    const { name, startTime, endTime, capacity, isActive = true } = req.body;

    if (!startTime || !endTime || capacity === undefined || capacity === null) {
      return res.status(400).json({
        message: "startTime, endTime and capacity are required",
      });
    }

    // startTime/endTime must be ISO with timezone (Z or +05:30)
    const start = dayjs(startTime);
    const end = dayjs(endTime);

    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }

    if (!start.isBefore(end)) {
      return res.status(400).json({ message: "startTime must be before endTime" });
    }

    const slot = await prisma.slot.create({
      data: {
        name: name || null,
        startTime: start.toDate(), // stored as instant (UTC internally)
        endTime: end.toDate(),
        capacity: Number(capacity),
        isActive: Boolean(isActive),
      },
    });

    return res.status(201).json({
      message: "Slot created",
      slot,
      debug: {
        storedStartIST: formatIST(slot.startTime),
        storedEndIST: formatIST(slot.endTime),
      },
    });
  } catch (err) {
    console.error("Create Slot Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   UPDATE SLOT
---------------------------------------- */
export const updateSlot = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { name, startTime, endTime, capacity, isActive } = req.body;

    const existing = await prisma.slot.findUnique({
      where: { id: slotId }, // ✅ Int
    });

    if (!existing) {
      return res.status(404).json({ message: "Slot not found" });
    }

    const nextStart = startTime ? dayjs(startTime) : dayjs(existing.startTime);
    const nextEnd = endTime ? dayjs(endTime) : dayjs(existing.endTime);

    if (!nextStart.isValid() || !nextEnd.isValid()) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }

    if (!nextStart.isBefore(nextEnd)) {
      return res.status(400).json({ message: "startTime must be before endTime" });
    }

    const slot = await prisma.slot.update({
      where: { id: slotId }, // ✅ Int
      data: {
        name: name ?? existing.name,
        startTime: nextStart.toDate(),
        endTime: nextEnd.toDate(),
        capacity: capacity !== undefined ? Number(capacity) : existing.capacity,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      },
    });

    return res.json({ message: "Slot updated", slot });
  } catch (err) {
    console.error("Update Slot Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


/* ----------------------------------------
   GET ALL ACTIVE SLOTS
   (returns formatted times for UI)
---------------------------------------- */
export const getSlots = async (req, res) => {
  try {
    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
    });

    const formatted = slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      startTime: slot.startTime, // keep raw ISO for edit
      endTime: slot.endTime,
      startTimeLabel: formatTime(slot.startTime), // display label
      endTimeLabel: formatTime(slot.endTime),
      capacity: slot.capacity,
      isActive: slot.isActive,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
    }));

    return res.status(200).json({ slots: formatted });
  } catch (err) {
    console.error("Get Slots Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   GET SLOTS BY DATE (CAPACITY AWARE)
   date=YYYY-MM-DD (IST)
---------------------------------------- */
export const getSlotsByDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date=YYYY-MM-DD is required" });
    }

    const range = istDayRangeUtc(date);
    if (!range) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const { startUtc, endUtc } = range;

    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      include: {
        orderSlots: {
          where: {
            date: {
              gte: startUtc,
              lt: endUtc,
            },
          },
        },
      },
    });

    const formatted = slots.map((slot) => {
      const booked = slot.orderSlots.reduce((sum, os) => sum + (os.count || 0), 0);

      return {
        id: slot.id,
        name: slot.name,
        startTime: formatTime(slot.startTime),
        endTime: formatTime(slot.endTime),
        startTimeLabel: formatTime(slot.startTime),
        endTimeLabel: formatTime(slot.endTime),
        capacity: slot.capacity,
        booked,
        remaining: Math.max(0, slot.capacity - booked),
        isFull: booked >= slot.capacity,
      };
    });

    return res.status(200).json({ date, slots: formatted });
  } catch (err) {
    console.error("Slot Date Wise Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   BOOK SLOT (CAPACITY SAFE)
   slotId: string
   orderDate: YYYY-MM-DD (IST) or ISO
---------------------------------------- */
export const bookSlot = async (slotId, orderDate) => {
  try {
    // ✅ We treat orderDate as "date" in IST
    const dateStr = dayjs(orderDate).isValid()
      ? dayjs(orderDate).tz(TZ).format("YYYY-MM-DD")
      : null;

    if (!dateStr) throw new Error("Invalid order date");

    const range = istDayRangeUtc(dateStr);
    if (!range) throw new Error("Invalid order date");

    const { startUtc, endUtc } = range;

    return await prisma.$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({ where: { id: slotId } });
      if (!slot) throw new Error("Slot not found");

      // find record for that slot + IST day (range search)
      const existing = await tx.orderSlot.findFirst({
        where: {
          slotId,
          date: { gte: startUtc, lt: endUtc },
        },
      });

      if (!existing) {
        // create first booking
        await tx.orderSlot.create({
          data: {
            slotId,
            date: startUtc, // store start-of-day UTC for that IST day
            count: 1,
          },
        });
        return { success: true };
      }

      if (existing.count >= slot.capacity) {
        throw new Error("Slot is already full");
      }

      await tx.orderSlot.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });

      return { success: true };
    });
  } catch (err) {
    console.error("Book Slot Error:", err);
    throw err;
  }
};

/* ----------------------------------------
   DELETE SLOT
---------------------------------------- */
export const deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;

    const slotId = Number(id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
    });

    if (!slot) {
      return res.status(404).json({ message: "Slot not found" });
    }

    await prisma.slot.delete({
      where: { id: slotId }, // ✅ must be Int
    });

    return res.status(200).json({ message: "Slot deleted successfully" });
  } catch (err) {
    console.error("Delete Slot Error:", err);

    // Foreign key constraint (bookings exist)
    if (err?.code === "P2003") {
      return res.status(400).json({
        message: "Cannot delete slot because it has bookings",
      });
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
};
