import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import dayjs from "dayjs";

const formatTime = (date) =>
  dayjs(date).format("hh:mm A");

/* ----------------------------------------
   CREATE SLOT
---------------------------------------- */
export const createSlot = async (req, res) => {
  try {
    const { name, startTime, endTime, capacity, isActive = true } = req.body;

    if (!startTime || !endTime || !capacity) {
      return res.status(400).json({
        message: "startTime, endTime and capacity are required",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ message: "Invalid time format" });
    }

    if (start >= end) {
      return res.status(400).json({
        message: "startTime must be before endTime",
      });
    }

    const slot = await prisma.slot.create({
      data: {
        name,
        startTime: start,
        endTime: end,
        capacity: Number(capacity),
        isActive,
      },
    });

    res.status(201).json({ message: "Slot created", slot });
  } catch (err) {
    console.error("Create Slot Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   GET ALL ACTIVE SLOTS
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
      startTime: formatTime(slot.startTime),
      endTime: formatTime(slot.endTime),
      capacity: slot.capacity,
      isActive: slot.isActive,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
    }));

    res.status(200).json({ slots: formatted });
  } catch (err) {
    console.error("Get Slots Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


/* ----------------------------------------
   GET SLOTS BY DATE (CAPACITY AWARE)
---------------------------------------- */
export const getSlotsByDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date=YYYY-MM-DD is required" });
    }

    const reqDate = new Date(date);
    if (isNaN(reqDate)) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const startOfDay = new Date(reqDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      include: {
        orderSlots: {
          where: {
            date: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
        },
      },
    });

    const formatted = slots.map((slot) => {
      const booked = slot.orderSlots.reduce(
        (sum, os) => sum + os.count,
        0
      );

      return {
        id: slot.id,
        name: slot.name,
        startTime: formatTime(slot.startTime),
        endTime: formatTime(slot.endTime),
        capacity: slot.capacity,
        booked,
        remaining: Math.max(0, slot.capacity - booked),
        isFull: booked >= slot.capacity,
      };
    });

    res.status(200).json({ date, slots: formatted });
  } catch (err) {
    console.error("Slot Date Wise Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   BOOK SLOT (CAPACITY SAFE)
---------------------------------------- */
export const bookSlot = async (slotId, orderDate) => {
  try {
    const dateObj = new Date(orderDate);
    if (isNaN(dateObj)) throw new Error("Invalid order date");

    const dateOnly = new Date(dateObj);
    dateOnly.setHours(0, 0, 0, 0);

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
    });

    if (!slot) throw new Error("Slot not found");

    let record = await prisma.orderSlot.findFirst({
      where: {
        slotId,
        date: dateOnly,
      },
    });

    if (!record) {
      await prisma.orderSlot.create({
        data: {
          slotId,
          date: dateOnly,
          count: 1,
        },
      });
      return { success: true };
    }

    if (record.count >= slot.capacity) {
      throw new Error("Slot is already full");
    }

    await prisma.orderSlot.update({
      where: { id: record.id },
      data: {
        count: { increment: 1 },
      },
    });

    return { success: true };
  } catch (err) {
    console.error("Book Slot Error:", err);
    throw err;
  }
};

/* ----------------------------------------
   UPDATE SLOT
---------------------------------------- */
export const updateSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime, capacity, isActive } = req.body;

    const slot = await prisma.slot.findUnique({
      where: { id: Number(id) },
    });

    if (!slot) {
      return res.status(404).json({ message: "Slot not found" });
    }

    const updated = await prisma.slot.update({
      where: { id: Number(id) },
      data: {
        name: name ?? slot.name,
        startTime: startTime ? new Date(startTime) : slot.startTime,
        endTime: endTime ? new Date(endTime) : slot.endTime,
        capacity: capacity ?? slot.capacity,
        isActive: isActive ?? slot.isActive,
      },
    });

    res.status(200).json({
      message: "Slot updated successfully",
      slot: updated,
    });
  } catch (err) {
    console.error("Update Slot Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ----------------------------------------
   DELETE SLOT
---------------------------------------- */
export const deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;

    const slot = await prisma.slot.findUnique({
      where: { id: Number(id) },
    });

    if (!slot) {
      return res.status(404).json({ message: "Slot not found" });
    }

    await prisma.slot.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({ message: "Slot deleted successfully" });
  } catch (err) {
    console.error("Delete Slot Error:", err);

    if (err.code === "P2003") {
      return res.status(400).json({
        message: "Cannot delete slot because it has bookings",
      });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
};
