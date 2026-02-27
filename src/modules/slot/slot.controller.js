import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const prisma = new PrismaClient();
const TZ = "Asia/Kolkata";



// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────

/** Format to readable IST time  e.g. "09:30 AM" */
const formatTime = (d) => (d ? dayjs(d).tz(TZ).format("hh:mm A") : null);

/** Format full IST datetime */
const formatIST = (d) => (d ? dayjs(d).tz(TZ).format("YYYY-MM-DD hh:mm A") : null);
const REL = {
  dayConfigs: "slotDayConfigs",
  dateOverrides: "slotDateOverrides",
};
/**
 * Build UTC start/end for a given IST date string (YYYY-MM-DD)
 * so we can query DB with gte / lt
 */
const istDayRangeUtc = (dateStr) => {
  const start = dayjs.tz(`${dateStr} 00:00`, "YYYY-MM-DD HH:mm", TZ);
  if (!start.isValid()) return null;
  return {
    startUtc: start.toDate(),
    endUtc: start.add(1, "day").toDate(),
  };
};

/**
 * Resolve effective capacity for a slot on a specific IST date.
 *
 * Priority:
 *  1. SlotDateOverride  (specific calendar date)
 *  2. SlotDayConfig     (day-of-week, e.g. every Monday)
 *  3. slot.capacity     (global default)
 *
 * @param {object} tx      - Prisma transaction client (or prisma directly)
 * @param {object} slot    - Slot record (must have .id and .capacity)
 * @param {string} dateStr - "YYYY-MM-DD" in IST
 */
const resolveCapacity = async (tx, slot, dateStr) => {
  const parsed = dayjs.tz(dateStr, "YYYY-MM-DD", TZ);
  if (!parsed.isValid()) return 0;

  const date = parsed.startOf("day").toDate();
  const dayOfWeek = parsed.day(); // 0 Sun … 6 Sat

  // 1️⃣ Specific date override (highest priority)
  const dateOverride = await tx.slotDateOverride.findUnique({
    where: { slotId_date: { slotId: slot.id, date } },
  });

  // ✅ If override exists but inactive => CLOSED
  if (dateOverride) {
    return dateOverride.isActive ? Number(dateOverride.capacity || 0) : 0;
  }

  // 2️⃣ Day-of-week config
  const dayConfig = await tx.slotDayConfig.findUnique({
    where: { slotId_dayOfWeek: { slotId: slot.id, dayOfWeek } },
  });

  // ✅ If day config exists but inactive => CLOSED
  if (dayConfig) {
    return dayConfig.isActive ? Number(dayConfig.capacity || 0) : 0;
  }

  // 3️⃣ Global default capacity
  return Number(slot.capacity || 0);
};

// ─────────────────────────────────────────
//  SLOT CRUD
// ─────────────────────────────────────────

/**
 * POST /slots
 * Create a new slot with a global default capacity.
 * Body: { name?, startTime (ISO), endTime (ISO), capacity, isActive? }
 */
export const createSlot = async (req, res) => {
  try {
    const { name, startTime, endTime, capacity, isActive = true } = req.body;

    if (!startTime || !endTime || capacity === undefined || capacity === null) {
      return res.status(400).json({
        message: "startTime, endTime and capacity are required",
      });
    }

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
        name: name ?? null,
        startTime: start.toDate(),
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

/**
 * PUT /slots/:id
 * Update a slot's global settings.
 * Body: { name?, startTime?, endTime?, capacity?, isActive? }
 */
export const updateSlot = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { name, startTime, endTime, capacity, isActive } = req.body;

    const existing = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!existing) return res.status(404).json({ message: "Slot not found" });

    const nextStart = startTime ? dayjs(startTime) : dayjs(existing.startTime);
    const nextEnd = endTime ? dayjs(endTime) : dayjs(existing.endTime);

    if (!nextStart.isValid() || !nextEnd.isValid()) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }
    if (!nextStart.isBefore(nextEnd)) {
      return res.status(400).json({ message: "startTime must be before endTime" });
    }

    const slot = await prisma.slot.update({
      where: { id: slotId },
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

/**
 * DELETE /slots/:id
 */
export const deleteSlot = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    await prisma.slot.delete({ where: { id: slotId } });

    return res.status(200).json({ message: "Slot deleted successfully" });
  } catch (err) {
    console.error("Delete Slot Error:", err);
    if (err?.code === "P2003") {
      return res
        .status(400)
        .json({ message: "Cannot delete slot because it has bookings" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /slots
 * All active slots with their day configs and date overrides.
 */
export const getSlots = async (req, res) => {
  try {
    const today = new Date();

    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      include: {
        dayConfigs: { orderBy: { dayOfWeek: "asc" } },
        dateOverrides: {
          where: { date: { gte: today } },
          orderBy: { date: "asc" },
        },

        // ✅ IMPORTANT: include orderSlots so slot.orderSlots exists
        orderSlots: {
          // optional: if your orderSlot has a date field, filter to today/future
          // where: { date: { gte: today } },
          select: { count: true }, // keep it light
        },
      },
    });

    const formatted = slots
      .map((slot) => {
        const effectiveCapacity =
          slot.dateOverrides?.[0]?.capacity ??
          slot.dayConfigs?.[0]?.capacity ??
          slot.capacity;

        if (Number(effectiveCapacity || 0) <= 0) return null;

        const booked = (slot.orderSlots ?? []).reduce(
          (sum, os) => sum + (os?.count || 0),
          0
        );

        const remaining = Math.max(0, effectiveCapacity - booked);

        return {
          id: slot.id,
          name: slot.name,
          startTimeLabel: formatTime(slot.startTime),
          endTimeLabel: formatTime(slot.endTime),
          defaultCapacity: slot.capacity,
          startTime: slot.startTime,
          endTime: slot.endTime,
          effectiveCapacity,
          capacitySource: slot.dateOverrides?.[0]
            ? "date_override"
            : slot.dayConfigs?.[0]
            ? "day_config"
            : "default",
          booked,
          remaining,
          isFull: booked >= effectiveCapacity,
        };
      })
      .filter(Boolean);

    return res.status(200).json({ slots: formatted });
  } catch (err) {
    console.error("Get Slots Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /slots/by-date?date=YYYY-MM-DD
 * Returns each slot with effective capacity, booked count, and remaining seats
 * for the given IST date — respecting day-of-week and date overrides.
 */
export const getSlotsByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date=YYYY-MM-DD is required" });

    const range = istDayRangeUtc(date);
    if (!range) return res.status(400).json({ message: "Invalid date format" });

    const { startUtc, endUtc } = range;
    const dayOfWeek = dayjs.tz(date, "YYYY-MM-DD", TZ).day();
    const specificDate = dayjs.tz(date, "YYYY-MM-DD", TZ).startOf("day").toDate();

    const slots = await prisma.slot.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      include: {
        orderSlots: { where: { date: { gte: startUtc, lt: endUtc } } },

        // ✅ IMPORTANT: include configs even if inactive (so we can close the slot)
        dayConfigs: { where: { dayOfWeek } },
        dateOverrides: { where: { date: specificDate } },
      },
    });

    const formatted = slots
      .map((slot) => {
        const dateOv = slot.dateOverrides?.[0] || null;
        const dayCfg = slot.dayConfigs?.[0] || null;

        let effectiveCapacity = Number(slot.capacity || 0);
        let capacitySource = "default";

        if (dateOv) {
          effectiveCapacity = dateOv.isActive ? Number(dateOv.capacity || 0) : 0;
          capacitySource = "date_override";
        } else if (dayCfg) {
          effectiveCapacity = dayCfg.isActive ? Number(dayCfg.capacity || 0) : 0;
          capacitySource = "day_config";
        }

        // ✅ hide closed
        if (effectiveCapacity <= 0) return null;

        const booked = (slot.orderSlots || []).reduce((sum, os) => sum + (os.count || 0), 0);
        const remaining = Math.max(0, effectiveCapacity - booked);

        return {
          id: slot.id,
          name: slot.name,
          startTimeLabel: formatTime(slot.startTime),
          endTimeLabel: formatTime(slot.endTime),
          startTime: formatTime(slot.startTime),
          endTime: formatTime(slot.endTime),
          defaultCapacity: slot.capacity,
          effectiveCapacity,
          capacitySource,
          booked,
          remaining,
          isFull: booked >= effectiveCapacity,
        };
      })
      .filter(Boolean);

    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    return res.status(200).json({ date, dayName, dayOfWeek, slots: formatted });
  } catch (err) {
    console.error("Slot Date Wise Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /slots/capacity-preview?slotId=1&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Preview effective capacity for a slot across a date range (useful for admin calendar).
 */
export const getCapacityPreview = async (req, res) => {
  try {
    const slotId = Number(req.query.slotId);
    const { from, to } = req.query;

    if (Number.isNaN(slotId) || !from || !to) {
      return res
        .status(400)
        .json({ message: "slotId, from (YYYY-MM-DD) and to (YYYY-MM-DD) are required" });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        dayConfigs: { where: { isActive: true } },
        dateOverrides: { where: { isActive: true } },
        orderSlots: true,
      },
    });

    if (!slot) return res.status(404).json({ message: "Slot not found" });

    // Build a map: "YYYY-MM-DD" → dateOverride
    const overrideMap = {};
    for (const o of slot.dateOverrides) {
      const key = dayjs(o.date).tz(TZ).format("YYYY-MM-DD");
      overrideMap[key] = o.capacity;
    }

    // Build a map: dayOfWeek → capacity
    const dayConfigMap = {};
    for (const dc of slot.dayConfigs) {
      dayConfigMap[dc.dayOfWeek] = dc.capacity;
    }

    // Build a map: "YYYY-MM-DD" → booked count
    const bookedMap = {};
    for (const os of slot.orderSlots) {
      const key = dayjs(os.date).tz(TZ).format("YYYY-MM-DD");
      bookedMap[key] = (bookedMap[key] || 0) + os.count;
    }

    // Iterate from → to
    const result = [];
    let cursor = dayjs.tz(from, "YYYY-MM-DD", TZ).startOf("day");
    const end = dayjs.tz(to, "YYYY-MM-DD", TZ).startOf("day");

    if (cursor.isAfter(end)) {
      return res.status(400).json({ message: "'from' must be before or equal to 'to'" });
    }

    while (!cursor.isAfter(end)) {
      const dateStr = cursor.format("YYYY-MM-DD");
      const dow = cursor.day();

      const effectiveCapacity =
        overrideMap[dateStr] !== undefined
          ? overrideMap[dateStr]
          : dayConfigMap[dow] !== undefined
          ? dayConfigMap[dow]
          : slot.capacity;

      const booked = bookedMap[dateStr] || 0;
      const remaining = Math.max(0, effectiveCapacity - booked);

      result.push({
        date: dateStr,
        dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow],
        effectiveCapacity,
        capacitySource:
          overrideMap[dateStr] !== undefined
            ? "date_override"
            : dayConfigMap[dow] !== undefined
            ? "day_config"
            : "default",
        booked,
        remaining,
        isFull: booked >= effectiveCapacity,
      });

      cursor = cursor.add(1, "day");
    }

    return res.status(200).json({
      slotId,
      slotName: slot.name,
      from,
      to,
      preview: result,
    });
  } catch (err) {
    console.error("Capacity Preview Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────
//  DAY-OF-WEEK CONFIG
// ─────────────────────────────────────────

/**
 * POST /slots/:id/day-config
 * Upsert capacity for a day of week.
 * Body: { dayOfWeek: 0-6, capacity: number, isActive?: boolean }
 *
 * dayOfWeek: 0=Sunday, 1=Monday … 6=Saturday
 */
export const upsertDayConfig = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { dayOfWeek, capacity, isActive = true } = req.body;

    if (dayOfWeek === undefined || dayOfWeek === null) {
      return res.status(400).json({ message: "dayOfWeek is required (0=Sun … 6=Sat)" });
    }
    if (Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) {
      return res.status(400).json({ message: "dayOfWeek must be between 0 and 6" });
    }
    if (capacity === undefined || capacity === null) {
      return res.status(400).json({ message: "capacity is required" });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const config = await prisma.slotDayConfig.upsert({
      where: { slotId_dayOfWeek: { slotId, dayOfWeek: Number(dayOfWeek) } },
      create: {
        slotId,
        dayOfWeek: Number(dayOfWeek),
        capacity: Number(capacity),
        isActive: Boolean(isActive),
      },
      update: {
        capacity: Number(capacity),
        isActive: Boolean(isActive),
      },
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return res.status(200).json({
      message: `Day config saved for ${dayNames[config.dayOfWeek]}`,
      config: { ...config, dayName: dayNames[config.dayOfWeek] },
    });
  } catch (err) {
    console.error("Upsert Day Config Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * POST /slots/:id/day-config/bulk
 * Set capacity for multiple days at once.
 * Body: { configs: [{ dayOfWeek: 1, capacity: 10 }, { dayOfWeek: 6, capacity: 5 }] }
 */
export const bulkUpsertDayConfig = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ message: "configs array is required" });
    }

    // Validate all entries
    for (const c of configs) {
      if (c.dayOfWeek < 0 || c.dayOfWeek > 6) {
        return res
          .status(400)
          .json({ message: `Invalid dayOfWeek: ${c.dayOfWeek}. Must be 0-6` });
      }
      if (c.capacity === undefined || c.capacity === null) {
        return res
          .status(400)
          .json({ message: `capacity is required for dayOfWeek ${c.dayOfWeek}` });
      }
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    // Run all upserts in a transaction
    const results = await prisma.$transaction(
      configs.map((c) =>
        prisma.slotDayConfig.upsert({
          where: { slotId_dayOfWeek: { slotId, dayOfWeek: Number(c.dayOfWeek) } },
          create: {
            slotId,
            dayOfWeek: Number(c.dayOfWeek),
            capacity: Number(c.capacity),
            isActive: c.isActive !== undefined ? Boolean(c.isActive) : true,
          },
          update: {
            capacity: Number(c.capacity),
            isActive: c.isActive !== undefined ? Boolean(c.isActive) : true,
          },
        })
      )
    );

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return res.status(200).json({
      message: `${results.length} day config(s) saved`,
      configs: results.map((r) => ({ ...r, dayName: dayNames[r.dayOfWeek] })),
    });
  } catch (err) {
    console.error("Bulk Upsert Day Config Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /slots/:id/day-config
 * Get all day-of-week configs for a slot.
 */
export const getDayConfigs = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const configs = await prisma.slotDayConfig.findMany({
      where: { slotId },
      orderBy: { dayOfWeek: "asc" },
    });

    // Build full week view (even days with no config show default)
    const weekView = Array.from({ length: 7 }, (_, i) => {
      const config = configs.find((c) => c.dayOfWeek === i);
      return {
        dayOfWeek: i,
        dayName: dayNames[i],
        hasConfig: !!config,
        capacity: config?.capacity ?? slot.capacity,
        effectiveCapacity: config?.isActive ? config.capacity : slot.capacity,
        isActive: config?.isActive ?? null,
        configId: config?.id ?? null,
      };
    });

    return res.status(200).json({
      slotId,
      defaultCapacity: slot.capacity,
      weekView,
      rawConfigs: configs,
    });
  } catch (err) {
    console.error("Get Day Configs Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * DELETE /slots/:id/day-config/:dayOfWeek
 * Remove the day-of-week override (slot will fall back to default capacity).
 */
export const deleteDayConfig = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    const dayOfWeek = Number(req.params.dayOfWeek);

    if (Number.isNaN(slotId) || Number.isNaN(dayOfWeek)) {
      return res.status(400).json({ message: "Invalid slotId or dayOfWeek" });
    }

    await prisma.slotDayConfig.deleteMany({
      where: { slotId, dayOfWeek },
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return res.status(200).json({
      message: `Day config removed for ${dayNames[dayOfWeek]}. Will fall back to default capacity.`,
    });
  } catch (err) {
    console.error("Delete Day Config Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────
//  DATE OVERRIDE
// ─────────────────────────────────────────

/**
 * POST /slots/:id/date-override
 * Set capacity for a specific date (e.g. holiday).
 * Body: { date: "YYYY-MM-DD", capacity: number, isActive?: boolean, note?: string }
 */
export const upsertDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { date, capacity, isActive = true, note } = req.body;

    if (!date || capacity === undefined || capacity === null) {
      return res.status(400).json({ message: "date and capacity are required" });
    }

    const parsedDate = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsedDate.isValid()) {
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const dbDate = parsedDate.startOf("day").toDate();

    const override = await prisma.slotDateOverride.upsert({
      where: { slotId_date: { slotId, date: dbDate } },
      create: {
        slotId,
        date: dbDate,
        capacity: Number(capacity),
        isActive: Boolean(isActive),
        note: note ?? null,
      },
      update: {
        capacity: Number(capacity),
        isActive: Boolean(isActive),
        note: note ?? null,
      },
    });

    return res.status(200).json({
      message: `Date override saved for ${date}`,
      override,
    });
  } catch (err) {
    console.error("Upsert Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * POST /slots/:id/date-override/bulk
 * Set overrides for multiple dates at once.
 * Body: { overrides: [{ date: "YYYY-MM-DD", capacity: number, note?: string }] }
 */
export const bulkUpsertDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const { overrides } = req.body;
    if (!Array.isArray(overrides) || overrides.length === 0) {
      return res.status(400).json({ message: "overrides array is required" });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    // Validate all entries
    for (const o of overrides) {
      if (!dayjs.tz(o.date, "YYYY-MM-DD", TZ).isValid()) {
        return res.status(400).json({ message: `Invalid date: ${o.date}` });
      }
      if (o.capacity === undefined || o.capacity === null) {
        return res.status(400).json({ message: `capacity required for date ${o.date}` });
      }
    }

    const results = await prisma.$transaction(
      overrides.map((o) => {
        const dbDate = dayjs.tz(o.date, "YYYY-MM-DD", TZ).startOf("day").toDate();
        return prisma.slotDateOverride.upsert({
          where: { slotId_date: { slotId, date: dbDate } },
          create: {
            slotId,
            date: dbDate,
            capacity: Number(o.capacity),
            isActive: o.isActive !== undefined ? Boolean(o.isActive) : true,
            note: o.note ?? null,
          },
          update: {
            capacity: Number(o.capacity),
            isActive: o.isActive !== undefined ? Boolean(o.isActive) : true,
            note: o.note ?? null,
          },
        });
      })
    );

    return res.status(200).json({
      message: `${results.length} date override(s) saved`,
      overrides: results,
    });
  } catch (err) {
    console.error("Bulk Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /slots/:id/date-override
 * List all date overrides for a slot.
 * Query: ?upcoming=true  (only future overrides)
 */
export const getDateOverrides = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const upcoming = req.query.upcoming === "true";

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const overrides = await prisma.slotDateOverride.findMany({
      where: {
        slotId,
        ...(upcoming ? { date: { gte: new Date() } } : {}),
      },
      orderBy: { date: "asc" },
    });

    return res.status(200).json({
      slotId,
      count: overrides.length,
      overrides: overrides.map((o) => ({
        ...o,
        dateLabel: dayjs(o.date).tz(TZ).format("YYYY-MM-DD"),
        dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
          dayjs(o.date).tz(TZ).day()
        ],
      })),
    });
  } catch (err) {
    console.error("Get Date Overrides Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * DELETE /slots/:id/date-override/:date
 * Remove the override for a specific date (e.g. "2025-10-02").
 */
export const deleteDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    const { date } = req.params;

    if (Number.isNaN(slotId)) {
      return res.status(400).json({ message: "Invalid slot id" });
    }

    const parsedDate = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsedDate.isValid()) {
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const dbDate = parsedDate.startOf("day").toDate();

    const deleted = await prisma.slotDateOverride.deleteMany({
      where: { slotId, date: dbDate },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ message: "No override found for this date" });
    }

    return res.status(200).json({ message: `Date override for ${date} removed` });
  } catch (err) {
    console.error("Delete Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────
//  BOOK SLOT (INTERNAL – called from Order controller)
// ─────────────────────────────────────────

/**
 * bookSlot(slotId, orderDate)
 * Atomically books one seat in a slot for a given IST date.
 * Respects effective capacity (date override > day config > default).
 * Throws on failure — caller should wrap in try/catch.
 *
 * @param {number} slotId
 * @param {Date|string} orderDate
 * @returns {{ success: boolean, remaining: number }}
 */
export const bookSlot = async (slotId, orderDate) => {
  const dateStr = dayjs(orderDate).isValid()
    ? dayjs(orderDate).tz(TZ).format("YYYY-MM-DD")
    : null;

  if (!dateStr) throw new Error("Invalid order date");

  const range = istDayRangeUtc(dateStr);
  if (!range) throw new Error("Invalid order date range");

  const { startUtc, endUtc } = range;

  return await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId } });
    if (!slot) throw new Error("Slot not found");
    if (!slot.isActive) throw new Error("Slot is not active");

    const effectiveCapacity = await resolveCapacity(tx, slot, dateStr);

    if (effectiveCapacity === 0) throw new Error("Slot is closed on this date");

    const existing = await tx.orderSlot.findFirst({
      where: { slotId, date: { gte: startUtc, lt: endUtc } },
    });

    if (!existing) {
      // First booking of this slot on this date
      await tx.orderSlot.create({
        data: { slotId, date: startUtc, count: 1 },
      });
      return { success: true, remaining: effectiveCapacity - 1 };
    }

    if (existing.count >= effectiveCapacity) {
      throw new Error(`Slot is full for ${dateStr} (capacity: ${effectiveCapacity})`);
    }

    await tx.orderSlot.update({
      where: { id: existing.id },
      data: { count: { increment: 1 } },
    });

    return { success: true, remaining: effectiveCapacity - existing.count - 1 };
  });
};

/**
 * releaseSlot(slotId, orderDate)
 * Releases one seat (e.g. when an order is cancelled).
 *
 * @param {number} slotId
 * @param {Date|string} orderDate
 */
export const releaseSlot = async (slotId, orderDate) => {
  const dateStr = dayjs(orderDate).isValid()
    ? dayjs(orderDate).tz(TZ).format("YYYY-MM-DD")
    : null;

  if (!dateStr) throw new Error("Invalid order date");

  const range = istDayRangeUtc(dateStr);
  if (!range) throw new Error("Invalid order date range");

  const { startUtc, endUtc } = range;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.orderSlot.findFirst({
      where: { slotId, date: { gte: startUtc, lt: endUtc } },
    });

    if (!existing || existing.count <= 0) return { success: true }; // nothing to release

    await tx.orderSlot.update({
      where: { id: existing.id },
      data: { count: { decrement: 1 } },
    });

    return { success: true };
  });
};