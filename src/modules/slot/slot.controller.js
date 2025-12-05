import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Create Slot
export const createSlot = async (req, res) => {
  try {
    const { name, startTime, capacity } = req.body;

    if (!startTime || !capacity) {
      return res.status(400).json({ message: "startTime and capacity are required" });
    }

    const slot = await prisma.slot.create({
      data: { name, startTime, capacity },
    });

    res.status(201).json({ message: "Slot created", slot });
  } catch (err) {
    console.error("Create Slot Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
export const getSlots = async (req, res) => {
  try {
    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" }
    });

    res.status(200).json({ slots });
  } catch (err) {
    console.error("Get Slots Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
export const getSlotsByDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date=YYYY-MM-DD is required" });
    }

    const reqDate = new Date(date);
    if (isNaN(reqDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const start = new Date(reqDate.setHours(0, 0, 0, 0));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      include: {
        orderSlots: {
          where: {
            date: {
              gte: start,
              lt: end,
            },
          },
        },
      },
    });

    const formatted = slots.map((slot) => {
      const booked = slot.orderSlots.reduce((sum, os) => sum + os.count, 0);

      return {
        id: slot.id,
        name:slot.name,
        startTime: slot.startTime,    // For user app display
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
export const bookSlot = async (slotId, orderDate) => {
  const dateOnly = new Date(orderDate.setHours(0,0,0,0));

  // 1. Fetch slot
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
  });

  if (!slot) throw new Error("Slot not found");

  // 2. Find existing OrderSlot
  let record = await prisma.orderSlot.findFirst({
    where: {
      slotId,
      date: dateOnly,
    },
  });

  // 3. If not found → create new record
  if (!record) {
    record = await prisma.orderSlot.create({
      data: {
        slotId,
        date: dateOnly,
        count: 1,
      },
    });
    return { success: true };
  }

  // 4. If full → throw
  if (record.count >= slot.capacity) {
    throw new Error("Slot is already full");
  }

  // 5. Increment count
  await prisma.orderSlot.update({
    where: { id: record.id },
    data: {
      count: { increment: 1 },
    },
  });

  return { success: true };
};


// UPDATE SLOT
export const updateSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, capacity, isActive } = req.body;

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
        startTime: startTime ?? slot.startTime,
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

// DELETE SLOT
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

    // Handle foreign key constraints (OrderSlot table)
    if (err.code === "P2003") {
      return res.status(400).json({
        message: "Cannot delete slot because it has bookings (OrderSlot records).",
      });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
};
