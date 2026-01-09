// utils/bookCenterSlotTx.js
export const bookCenterSlotTx = async (tx, centerSlotId, orderDate) => {
  const dateObj = new Date(orderDate);
  if (isNaN(dateObj)) throw new Error("Invalid orderDate format");

  // normalize date to start of day
  const dateOnly = new Date(dateObj);
  dateOnly.setHours(0, 0, 0, 0);

  // 1) fetch centerslot using tx (IMPORTANT: don't use prisma directly inside tx)
  const slot = await tx.centerSlot.findUnique({
    where: { id: Number(centerSlotId) },
  });

  if (!slot) throw new Error("Center slot not found");
  if (slot.isActive === false) throw new Error("Center slot is inactive");

  // 2) find booking row for that date
  const existing = await tx.centerSlotBooking.findFirst({
    where: {
      slotId: Number(centerSlotId),
      date: dateOnly,
    },
  });

  // 3) create if missing
  if (!existing) {
    if ((slot.capacity || 0) <= 0) throw new Error("Slot capacity not set");

    await tx.centerSlotBooking.create({
      data: {
        slotId: Number(centerSlotId),
        date: dateOnly,
        count: 1,
      },
    });

    return { success: true };
  }

  // 4) full check
  if (existing.count >= (slot.capacity || 0)) {
    throw new Error("Slot is already full");
  }

  // 5) increment
  await tx.centerSlotBooking.update({
    where: { id: existing.id },
    data: { count: { increment: 1 } },
  });

  return { success: true };
};
