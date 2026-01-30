export const bookCenterSlotTx = async (tx, centerSlotId, orderDate) => {
  const dateObj = new Date(orderDate);
  if (isNaN(dateObj.getTime())) throw new Error("Invalid orderDate format");

  // normalize date range for same day (00:00 -> 23:59:59)
  const dayStart = new Date(dateObj);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dateObj);
  dayEnd.setHours(23, 59, 59, 999);

  // 1) fetch centerslot
  const slot = await tx.centerSlot.findUnique({
    where: { id: Number(centerSlotId) },
    select: {
      id: true,
      centerId: true,
      capacity: true,
      isActive: true,
    },
  });

  if (!slot) throw new Error("Center slot not found");
  if (slot.isActive === false) throw new Error("Center slot is inactive");
  if ((slot.capacity || 0) <= 0) throw new Error("Slot capacity not set");

  // 2) how many already booked for this slot on this day
  const agg = await tx.centerSlotBooking.aggregate({
    where: {
      centerSlotId: Number(centerSlotId),
      slotDate: { gte: dayStart, lte: dayEnd },
    },
    _sum: { quantity: true },
  });

  const used = agg._sum.quantity || 0;

  // 3) full check
  if (used >= (slot.capacity || 0)) {
    throw new Error("Slot is already full");
  }

  // 4) create booking row (one row per booking)
  await tx.centerSlotBooking.create({
    data: {
      centerId: slot.centerId,
      centerSlotId: Number(centerSlotId),
      slotDate: dateObj, // keep exact datetime (or use dayStart if you want date-only)
      quantity: 1,
    },
  });

  return { success: true };
};