import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const bookSlotTx = async (tx, slotId, orderDate) => {
  // Ensure orderDate is a Date object
  const dateObj = new Date(orderDate);

  if (isNaN(dateObj)) {
    throw new Error("Invalid orderDate format");
  }

  // Normalize date to remove time
  const dateOnly = new Date(dateObj);
  dateOnly.setHours(0, 0, 0, 0);

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

  // 3. Create new record if none exists
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

  // 4. If full → error
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
