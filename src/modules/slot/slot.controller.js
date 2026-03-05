import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import prisma from '../../lib/prisma.js';
import redis, { getOrSet } from '../../utils/cache.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = "Asia/Kolkata";

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:           ()              => 'slots:all',
  byDate:        (date)          => `slots:date:${date}`,
  preview:       (slotId, f, t)  => `slots:preview:${slotId}:${f}:${t}`,
  dayConfigs:    (slotId)        => `slots:dayconfigs:${slotId}`,
  dateOverrides: (slotId)        => `slots:dateoverrides:${slotId}`,
};

/**
 * Invalidate caches after any write operation.
 * @param {number|null} slotId   - pass to also clear per-slot keys
 * @param {string|null} dateStr  - pass to also clear a specific date key
 */
const invalidateCaches = async (slotId = null, dateStr = null) => {
  const toDelete = [keys.all()];

  // Always wipe all date + preview caches — a capacity change affects every date
  const [dateKeys, previewKeys] = await Promise.all([
    redis.keys('slots:date:*'),
    redis.keys('slots:preview:*'),
  ]);
  toDelete.push(...dateKeys, ...previewKeys);

  // Per-slot keys
  if (slotId) {
    toDelete.push(keys.dayConfigs(slotId), keys.dateOverrides(slotId));
  }

  // Specific date key (for bookSlot / releaseSlot — faster, targeted)
  if (dateStr) {
    toDelete.push(keys.byDate(dateStr));
  }

  if (toDelete.length) await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  HELPERS  (unchanged)
// ─────────────────────────────────────────

const formatTime = (d) => (d ? dayjs(d).tz(TZ).format("hh:mm A") : null);
const formatIST  = (d) => (d ? dayjs(d).tz(TZ).format("YYYY-MM-DD hh:mm A") : null);

const istDayRangeUtc = (dateStr) => {
  const start = dayjs.tz(`${dateStr} 00:00`, "YYYY-MM-DD HH:mm", TZ);
  if (!start.isValid()) return null;
  return { startUtc: start.toDate(), endUtc: start.add(1, "day").toDate() };
};

const resolveCapacity = async (tx, slot, dateStr) => {
  const parsed = dayjs.tz(dateStr, "YYYY-MM-DD", TZ);
  if (!parsed.isValid()) return 0;

  const date      = parsed.startOf("day").toDate();
  const dayOfWeek = parsed.day();

  const dateOverride = await tx.slotDateOverride.findUnique({
    where: { slotId_date: { slotId: slot.id, date } },
  });
  if (dateOverride) return dateOverride.isActive ? Number(dateOverride.capacity || 0) : 0;

  const dayConfig = await tx.slotDayConfig.findUnique({
    where: { slotId_dayOfWeek: { slotId: slot.id, dayOfWeek } },
  });
  if (dayConfig) return dayConfig.isActive ? Number(dayConfig.capacity || 0) : 0;

  return Number(slot.capacity || 0);
};

// ─────────────────────────────────────────
//  SLOT CRUD
// ─────────────────────────────────────────

export const createSlot = async (req, res) => {
  try {
    const { name, startTime, endTime, capacity, isActive = true } = req.body;

    if (!startTime || !endTime || capacity === undefined || capacity === null) {
      return res.status(400).json({ message: "startTime, endTime and capacity are required" });
    }

    const start = dayjs(startTime);
    const end   = dayjs(endTime);

    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }
    if (!start.isBefore(end)) {
      return res.status(400).json({ message: "startTime must be before endTime" });
    }

    const slot = await prisma.slot.create({
      data: {
        name:      name ?? null,
        startTime: start.toDate(),
        endTime:   end.toDate(),
        capacity:  Number(capacity),
        isActive:  Boolean(isActive),
      },
    });

    await invalidateCaches(); // new slot → stale list

    return res.status(201).json({
      message: "Slot created",
      slot,
      debug: {
        storedStartIST: formatIST(slot.startTime),
        storedEndIST:   formatIST(slot.endTime),
      },
    });
  } catch (err) {
    console.error("Create Slot Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateSlot = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const { name, startTime, endTime, capacity, isActive } = req.body;

    const existing = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!existing) return res.status(404).json({ message: "Slot not found" });

    const nextStart = startTime ? dayjs(startTime) : dayjs(existing.startTime);
    const nextEnd   = endTime   ? dayjs(endTime)   : dayjs(existing.endTime);

    if (!nextStart.isValid() || !nextEnd.isValid()) {
      return res.status(400).json({ message: "Invalid datetime format" });
    }
    if (!nextStart.isBefore(nextEnd)) {
      return res.status(400).json({ message: "startTime must be before endTime" });
    }

    const slot = await prisma.slot.update({
      where: { id: slotId },
      data: {
        name:      name      ?? existing.name,
        startTime: nextStart.toDate(),
        endTime:   nextEnd.toDate(),
        capacity:  capacity  !== undefined ? Number(capacity)  : existing.capacity,
        isActive:  isActive  !== undefined ? Boolean(isActive) : existing.isActive,
      },
    });

    await invalidateCaches(slotId);

    return res.json({ message: "Slot updated", slot });
  } catch (err) {
    console.error("Update Slot Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteSlot = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    await prisma.slot.delete({ where: { id: slotId } });

    await invalidateCaches(slotId);

    return res.status(200).json({ message: "Slot deleted successfully" });
  } catch (err) {
    console.error("Delete Slot Error:", err);
    if (err?.code === "P2003") {
      return res.status(400).json({ message: "Cannot delete slot because it has bookings" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── CACHED ──────────────────────────────
export const getSlots = async (req, res) => {
  try {
    const data = await getOrSet(keys.all(), CACHE_TTL, async () => {
      const today = new Date();

      const slots = await prisma.slot.findMany({
        where:    { isActive: true },
        orderBy:  { startTime: "asc" },
        include: {
          dayConfigs:    { orderBy: { dayOfWeek: "asc" } },
          dateOverrides: { where: { date: { gte: today } }, orderBy: { date: "asc" } },
          orderSlots:    { select: { count: true } },
        },
      });

      return slots
        .map((slot) => {
          const effectiveCapacity =
            slot.dateOverrides?.[0]?.capacity ??
            slot.dayConfigs?.[0]?.capacity     ??
            slot.capacity;

          if (Number(effectiveCapacity || 0) <= 0) return null;

          const booked    = (slot.orderSlots ?? []).reduce((sum, os) => sum + (os?.count || 0), 0);
          const remaining = Math.max(0, effectiveCapacity - booked);

          return {
            id:               slot.id,
            name:             slot.name,
            startTimeLabel:   formatTime(slot.startTime),
            endTimeLabel:     formatTime(slot.endTime),
            startTime:        slot.startTime,
            endTime:          slot.endTime,
            defaultCapacity:  slot.capacity,
            effectiveCapacity,
            capacitySource:   slot.dateOverrides?.[0] ? "date_override" : slot.dayConfigs?.[0] ? "day_config" : "default",
            booked,
            remaining,
            isFull: booked >= effectiveCapacity,
          };
        })
        .filter(Boolean);
    });

    return res.status(200).json({ slots: data });
  } catch (err) {
    console.error("Get Slots Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── CACHED ──────────────────────────────
export const getSlotsByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date=YYYY-MM-DD is required" });

    const range = istDayRangeUtc(date);
    if (!range) return res.status(400).json({ message: "Invalid date format" });

    const result = await getOrSet(keys.byDate(date), CACHE_TTL, async () => {
      const { startUtc, endUtc } = range;
      const dayOfWeek    = dayjs.tz(date, "YYYY-MM-DD", TZ).day();
      const specificDate = dayjs.tz(date, "YYYY-MM-DD", TZ).startOf("day").toDate();

      const slots = await prisma.slot.findMany({
        where:   { isActive: true },
        orderBy: { startTime: "asc" },
        include: {
          orderSlots:    { where: { date: { gte: startUtc, lt: endUtc } } },
          dayConfigs:    { where: { dayOfWeek } },
          dateOverrides: { where: { date: specificDate } },
        },
      });

      const formatted = slots
        .map((slot) => {
          const dateOv = slot.dateOverrides?.[0] || null;
          const dayCfg = slot.dayConfigs?.[0]    || null;

          let effectiveCapacity = Number(slot.capacity || 0);
          let capacitySource    = "default";

          if (dateOv) {
            effectiveCapacity = dateOv.isActive ? Number(dateOv.capacity || 0) : 0;
            capacitySource    = "date_override";
          } else if (dayCfg) {
            effectiveCapacity = dayCfg.isActive ? Number(dayCfg.capacity || 0) : 0;
            capacitySource    = "day_config";
          }

          if (effectiveCapacity <= 0) return null;

          const booked    = (slot.orderSlots || []).reduce((sum, os) => sum + (os.count || 0), 0);
          const remaining = Math.max(0, effectiveCapacity - booked);

          return {
            id:               slot.id,
            name:             slot.name,
            startTimeLabel:   formatTime(slot.startTime),
            endTimeLabel:     formatTime(slot.endTime),
            startTime:        formatTime(slot.startTime),
            endTime:          formatTime(slot.endTime),
            defaultCapacity:  slot.capacity,
            effectiveCapacity,
            capacitySource,
            booked,
            remaining,
            isFull: booked >= effectiveCapacity,
          };
        })
        .filter(Boolean);

      const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dayOfWeek];
      return { date, dayName, dayOfWeek, slots: formatted };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Slot Date Wise Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── CACHED ──────────────────────────────
export const getCapacityPreview = async (req, res) => {
  try {
    const slotId = Number(req.query.slotId);
    const { from, to } = req.query;

    if (Number.isNaN(slotId) || !from || !to) {
      return res.status(400).json({ message: "slotId, from (YYYY-MM-DD) and to (YYYY-MM-DD) are required" });
    }

    const result = await getOrSet(keys.preview(slotId, from, to), CACHE_TTL, async () => {
      const slot = await prisma.slot.findUnique({
        where:   { id: slotId },
        include: {
          dayConfigs:    { where: { isActive: true } },
          dateOverrides: { where: { isActive: true } },
          orderSlots:    true,
        },
      });

      if (!slot) return null;

      const overrideMap  = {};
      const dayConfigMap = {};
      const bookedMap    = {};

      for (const o  of slot.dateOverrides) overrideMap[dayjs(o.date).tz(TZ).format("YYYY-MM-DD")] = o.capacity;
      for (const dc of slot.dayConfigs)    dayConfigMap[dc.dayOfWeek] = dc.capacity;
      for (const os of slot.orderSlots) {
        const key = dayjs(os.date).tz(TZ).format("YYYY-MM-DD");
        bookedMap[key] = (bookedMap[key] || 0) + os.count;
      }

      const preview = [];
      let cursor = dayjs.tz(from, "YYYY-MM-DD", TZ).startOf("day");
      const end  = dayjs.tz(to,   "YYYY-MM-DD", TZ).startOf("day");

      if (cursor.isAfter(end)) return null; // invalid range

      while (!cursor.isAfter(end)) {
        const dateStr         = cursor.format("YYYY-MM-DD");
        const dow             = cursor.day();
        const effectiveCapacity =
          overrideMap[dateStr]  !== undefined ? overrideMap[dateStr] :
          dayConfigMap[dow]     !== undefined ? dayConfigMap[dow]    : slot.capacity;

        const booked    = bookedMap[dateStr] || 0;
        const remaining = Math.max(0, effectiveCapacity - booked);

        preview.push({
          date: dateStr,
          dayName: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow],
          effectiveCapacity,
          capacitySource:
            overrideMap[dateStr]  !== undefined ? "date_override" :
            dayConfigMap[dow]     !== undefined ? "day_config"    : "default",
          booked,
          remaining,
          isFull: booked >= effectiveCapacity,
        });

        cursor = cursor.add(1, "day");
      }

      return { slotId, slotName: slot.name, from, to, preview };
    });

    if (!result) {
      return res.status(result === null && !from ? 400 : 404).json({
        message: result === null ? "'from' must be before or equal to 'to'" : "Slot not found",
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Capacity Preview Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────
//  DAY-OF-WEEK CONFIG
// ─────────────────────────────────────────

export const upsertDayConfig = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const { dayOfWeek, capacity, isActive = true } = req.body;

    if (dayOfWeek === undefined || dayOfWeek === null) return res.status(400).json({ message: "dayOfWeek is required (0=Sun … 6=Sat)" });
    if (Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6)  return res.status(400).json({ message: "dayOfWeek must be between 0 and 6" });
    if (capacity === undefined || capacity === null)       return res.status(400).json({ message: "capacity is required" });

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const config = await prisma.slotDayConfig.upsert({
      where:  { slotId_dayOfWeek: { slotId, dayOfWeek: Number(dayOfWeek) } },
      create: { slotId, dayOfWeek: Number(dayOfWeek), capacity: Number(capacity), isActive: Boolean(isActive) },
      update: { capacity: Number(capacity), isActive: Boolean(isActive) },
    });

    await invalidateCaches(slotId);

    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return res.status(200).json({
      message: `Day config saved for ${dayNames[config.dayOfWeek]}`,
      config:  { ...config, dayName: dayNames[config.dayOfWeek] },
    });
  } catch (err) {
    console.error("Upsert Day Config Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const bulkUpsertDayConfig = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) return res.status(400).json({ message: "configs array is required" });

    for (const c of configs) {
      if (c.dayOfWeek < 0 || c.dayOfWeek > 6)          return res.status(400).json({ message: `Invalid dayOfWeek: ${c.dayOfWeek}` });
      if (c.capacity === undefined || c.capacity === null) return res.status(400).json({ message: `capacity required for dayOfWeek ${c.dayOfWeek}` });
    }

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const results = await prisma.$transaction(
      configs.map((c) =>
        prisma.slotDayConfig.upsert({
          where:  { slotId_dayOfWeek: { slotId, dayOfWeek: Number(c.dayOfWeek) } },
          create: { slotId, dayOfWeek: Number(c.dayOfWeek), capacity: Number(c.capacity), isActive: c.isActive !== undefined ? Boolean(c.isActive) : true },
          update: { capacity: Number(c.capacity), isActive: c.isActive !== undefined ? Boolean(c.isActive) : true },
        })
      )
    );

    await invalidateCaches(slotId);

    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return res.status(200).json({
      message: `${results.length} day config(s) saved`,
      configs: results.map((r) => ({ ...r, dayName: dayNames[r.dayOfWeek] })),
    });
  } catch (err) {
    console.error("Bulk Upsert Day Config Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── CACHED ──────────────────────────────
export const getDayConfigs = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const data = await getOrSet(keys.dayConfigs(slotId), CACHE_TTL, async () => {
      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

      const configs = await prisma.slotDayConfig.findMany({
        where:   { slotId },
        orderBy: { dayOfWeek: "asc" },
      });

      const weekView = Array.from({ length: 7 }, (_, i) => {
        const config = configs.find((c) => c.dayOfWeek === i);
        return {
          dayOfWeek:         i,
          dayName:           dayNames[i],
          hasConfig:         !!config,
          capacity:          config?.capacity    ?? slot.capacity,
          effectiveCapacity: config?.isActive    ? config.capacity : slot.capacity,
          isActive:          config?.isActive    ?? null,
          configId:          config?.id          ?? null,
        };
      });

      return { slotId, defaultCapacity: slot.capacity, weekView, rawConfigs: configs };
    });

    return res.status(200).json(data);
  } catch (err) {
    console.error("Get Day Configs Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteDayConfig = async (req, res) => {
  try {
    const slotId    = Number(req.params.id);
    const dayOfWeek = Number(req.params.dayOfWeek);

    if (Number.isNaN(slotId) || Number.isNaN(dayOfWeek)) {
      return res.status(400).json({ message: "Invalid slotId or dayOfWeek" });
    }

    await prisma.slotDayConfig.deleteMany({ where: { slotId, dayOfWeek } });

    await invalidateCaches(slotId);

    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
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

export const upsertDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const { date, capacity, isActive = true, note } = req.body;

    if (!date || capacity === undefined || capacity === null) {
      return res.status(400).json({ message: "date and capacity are required" });
    }

    const parsedDate = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsedDate.isValid()) return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    const dbDate = parsedDate.startOf("day").toDate();

    const override = await prisma.slotDateOverride.upsert({
      where:  { slotId_date: { slotId, date: dbDate } },
      create: { slotId, date: dbDate, capacity: Number(capacity), isActive: Boolean(isActive), note: note ?? null },
      update: { capacity: Number(capacity), isActive: Boolean(isActive), note: note ?? null },
    });

    await invalidateCaches(slotId, date);

    return res.status(200).json({ message: `Date override saved for ${date}`, override });
  } catch (err) {
    console.error("Upsert Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const bulkUpsertDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const { overrides } = req.body;
    if (!Array.isArray(overrides) || overrides.length === 0) return res.status(400).json({ message: "overrides array is required" });

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    for (const o of overrides) {
      if (!dayjs.tz(o.date, "YYYY-MM-DD", TZ).isValid()) return res.status(400).json({ message: `Invalid date: ${o.date}` });
      if (o.capacity === undefined || o.capacity === null)  return res.status(400).json({ message: `capacity required for date ${o.date}` });
    }

    const results = await prisma.$transaction(
      overrides.map((o) => {
        const dbDate = dayjs.tz(o.date, "YYYY-MM-DD", TZ).startOf("day").toDate();
        return prisma.slotDateOverride.upsert({
          where:  { slotId_date: { slotId, date: dbDate } },
          create: { slotId, date: dbDate, capacity: Number(o.capacity), isActive: o.isActive !== undefined ? Boolean(o.isActive) : true, note: o.note ?? null },
          update: { capacity: Number(o.capacity), isActive: o.isActive !== undefined ? Boolean(o.isActive) : true, note: o.note ?? null },
        });
      })
    );

    await invalidateCaches(slotId); // wipes all date/preview caches

    return res.status(200).json({ message: `${results.length} date override(s) saved`, overrides: results });
  } catch (err) {
    console.error("Bulk Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── CACHED ──────────────────────────────
export const getDateOverrides = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const upcoming = req.query.upcoming === "true";

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ message: "Slot not found" });

    // Don't cache "upcoming" queries since result changes with time
    const cacheKey = upcoming ? null : keys.dateOverrides(slotId);

    const fetchFn = async () => {
      const overrides = await prisma.slotDateOverride.findMany({
        where:   { slotId, ...(upcoming ? { date: { gte: new Date() } } : {}) },
        orderBy: { date: "asc" },
      });

      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      return {
        slotId,
        count: overrides.length,
        overrides: overrides.map((o) => ({
          ...o,
          dateLabel: dayjs(o.date).tz(TZ).format("YYYY-MM-DD"),
          dayName:   dayNames[dayjs(o.date).tz(TZ).day()],
        })),
      };
    };

    const data = cacheKey
      ? await getOrSet(cacheKey, CACHE_TTL, fetchFn)
      : await fetchFn();

    return res.status(200).json(data);
  } catch (err) {
    console.error("Get Date Overrides Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteDateOverride = async (req, res) => {
  try {
    const slotId = Number(req.params.id);
    const { date } = req.params;

    if (Number.isNaN(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const parsedDate = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsedDate.isValid()) return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });

    const dbDate  = parsedDate.startOf("day").toDate();
    const deleted = await prisma.slotDateOverride.deleteMany({ where: { slotId, date: dbDate } });

    if (deleted.count === 0) return res.status(404).json({ message: "No override found for this date" });

    await invalidateCaches(slotId, date);

    return res.status(200).json({ message: `Date override for ${date} removed` });
  } catch (err) {
    console.error("Delete Date Override Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────
//  BOOK / RELEASE SLOT  (internal)
// ─────────────────────────────────────────

export const bookSlot = async (slotId, orderDate) => {
  const dateStr = dayjs(orderDate).isValid() ? dayjs(orderDate).tz(TZ).format("YYYY-MM-DD") : null;
  if (!dateStr) throw new Error("Invalid order date");

  const range = istDayRangeUtc(dateStr);
  if (!range) throw new Error("Invalid order date range");

  const { startUtc, endUtc } = range;

  const result = await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId } });
    if (!slot)          throw new Error("Slot not found");
    if (!slot.isActive) throw new Error("Slot is not active");

    const effectiveCapacity = await resolveCapacity(tx, slot, dateStr);
    if (effectiveCapacity === 0) throw new Error("Slot is closed on this date");

    const existing = await tx.orderSlot.findFirst({
      where: { slotId, date: { gte: startUtc, lt: endUtc } },
    });

    if (!existing) {
      await tx.orderSlot.create({ data: { slotId, date: startUtc, count: 1 } });
      return { success: true, remaining: effectiveCapacity - 1 };
    }

    if (existing.count >= effectiveCapacity) {
      throw new Error(`Slot is full for ${dateStr} (capacity: ${effectiveCapacity})`);
    }

    await tx.orderSlot.update({
      where: { id: existing.id },
      data:  { count: { increment: 1 } },
    });

    return { success: true, remaining: effectiveCapacity - existing.count - 1 };
  });

  // Invalidate only this date's cache — targeted, no need to wipe everything
  await redis.del(keys.byDate(dateStr), keys.all());

  return result;
};

export const releaseSlot = async (slotId, orderDate) => {
  const dateStr = dayjs(orderDate).isValid() ? dayjs(orderDate).tz(TZ).format("YYYY-MM-DD") : null;
  if (!dateStr) throw new Error("Invalid order date");

  const range = istDayRangeUtc(dateStr);
  if (!range) throw new Error("Invalid order date range");

  const { startUtc, endUtc } = range;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.orderSlot.findFirst({
      where: { slotId, date: { gte: startUtc, lt: endUtc } },
    });

    if (!existing || existing.count <= 0) return { success: true };

    await tx.orderSlot.update({
      where: { id: existing.id },
      data:  { count: { decrement: 1 } },
    });

    return { success: true };
  });

  // Invalidate only this date's cache
  await redis.del(keys.byDate(dateStr), keys.all());

  return result;
};