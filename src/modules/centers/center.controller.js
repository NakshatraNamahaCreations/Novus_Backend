import prisma from '../../lib/prisma.js';
import dayjs from "dayjs";

const TZ = "Asia/Kolkata";
const startOfDayDate = (dateStr) => dayjs.tz(dateStr, "YYYY-MM-DD", TZ).startOf("day").toDate();
const dayOfWeekFromDate = (dateStr) => dayjs.tz(dateStr, "YYYY-MM-DD", TZ).day();

const resolveCenterSlotCapacity = async (tx, slot, dateStr) => {
  const date = startOfDayDate(dateStr);
  const dayOfWeek = dayOfWeekFromDate(dateStr);
  const ov = await tx.centerSlotDateOverride.findUnique({
    where: { centerSlotId_date: { centerSlotId: slot.id, date } },
  });
  if (ov) return ov.isActive ? Number(ov.capacity || 0) : 0;
  const dc = await tx.centerSlotDayConfig.findUnique({
    where: { centerSlotId_dayOfWeek: { centerSlotId: slot.id, dayOfWeek } },
  });
  if (dc) return dc.isActive ? Number(dc.capacity || 0) : 0;
  return Number(slot.capacity || 0);
};

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const toBool = (v, fallback = false) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off", ""].includes(s)) return false;
  }
  return fallback;
};

/* ✅ CREATE Center */
export const createCenter = async (req, res) => {
  try {
    const { name, contactName, address, email, alternativeEmail, mobile, lat, long, cityId, isSelf, showApp, recommended, testIds = [] } = req.body;
    const cleanName = String(name || "").trim();
    const cleanAddress = String(address || "").trim();
    if (!cleanName || !cleanAddress) return res.status(400).json({ error: "Name and Address are required" });
    if (email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) return res.status(400).json({ error: "Email already registered" });
    }
    if (cityId) {
      const cityExists = await prisma.city.findUnique({ where: { id: Number(cityId) }, select: { id: true } });
      if (!cityExists) return res.status(400).json({ error: "Invalid cityId" });
    }
    const testIdNums = Array.isArray(testIds) ? testIds.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    if (testIdNums.length > 0) {
      const validTests = await prisma.test.findMany({ where: { id: { in: testIdNums } }, select: { id: true } });
      const validSet = new Set(validTests.map((t) => t.id));
      const invalidIds = testIdNums.filter((t) => !validSet.has(t));
      if (invalidIds.length) return res.status(400).json({ error: `Invalid testIds: ${invalidIds.join(", ")}` });
    }
    const center = await prisma.center.create({
      data: {
        name: cleanName,
        contactName: contactName ? String(contactName).trim() : null,
        address: cleanAddress,
        email: email || null,
        alternativeEmail: alternativeEmail || null,
        mobile: mobile || null,
        showApp: toBool(showApp, false),
        isSelf: toBool(isSelf, false),
        recommended: toBool(recommended, false),
        lat: lat !== undefined && lat !== null && lat !== "" ? Number(lat) : null,
        long: long !== undefined && long !== null && long !== "" ? Number(long) : null,
        ...(req.user?.id ? { createdBy: { connect: { id: Number(req.user.id) } } } : {}),
        ...(cityId ? { city: { connect: { id: Number(cityId) } } } : {}),
        ...(testIdNums.length > 0 ? { centerPackages: { create: testIdNums.map((tid) => ({ testId: tid })) } } : {}),
      },
      include: { city: true, centerPackages: { include: { test: true } } },
    });
    return res.status(201).json({ message: "Center created successfully", center });
  } catch (error) {
    console.error("Error creating center:", error);
    return res.status(500).json({ error: "Failed to create center" });
  }
};

/* ✅ GET ALL Centers */
export const getAllCenters = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "" } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const where = search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { mobile: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { city: { is: { name: { contains: search, mode: "insensitive" } } } },
    ]} : {};
    const total = await prisma.center.count({ where });
    const centers = await prisma.center.findMany({
      where,
      include: { city: true, centerPackages: { include: { test: true } } },
      orderBy: { name: "asc" },
      skip,
      take,
    });
    return res.json({ data: centers, meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) } });
  } catch (error) {
    console.error("Error fetching centers:", error);
    return res.status(500).json({ error: "Failed to fetch centers" });
  }
};

/* ✅ GET ALL Centers for admin */
export const getAllCentersforadmin = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "" } = req.query;
    let categoryIds = [];
    if (req.query.categoryId) {
      categoryIds = [Number(req.query.categoryId)];
    } else if (req.query.categoryIds) {
      if (Array.isArray(req.query.categoryIds)) {
        categoryIds = req.query.categoryIds.map(Number).filter(Boolean);
      } else {
        categoryIds = String(req.query.categoryIds).split(",").map((x) => Number(x.trim())).filter(Boolean);
      }
    }
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const where = {
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { city: { is: { name: { contains: search, mode: "insensitive" } } } },
      ]} : {}),
      ...(categoryIds.length > 0 ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}),
    };
    const total = await prisma.center.count({ where });
    const centers = await prisma.center.findMany({
      where,
      select: { id: true, name: true, contactName: true, mobile: true, email: true, address: true, isSelf: true, city: true, showApp: true, centerSlots: true },
      orderBy: { name: "asc" },
      skip,
      take,
    });
    return res.json({ data: centers, meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) } });
  } catch (error) {
    console.error("Error fetching centers:", error);
    return res.status(500).json({ error: "Failed to fetch centers" });
  }
};

/* ✅ GET ONE Center */
export const getCenterById = async (req, res) => {
  try {
    const { id } = req.params;
    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { city: true, centerPackages: { include: { test: true } }, categories: { include: { category: true } } },
    });
    if (!center) return res.status(404).json({ error: "Center not found" });
    return res.json(center);
  } catch (error) {
    console.error("Error fetching center:", error);
    return res.status(500).json({ error: "Failed to fetch center" });
  }
};

/* ✅ UPDATE Center */
export const updateCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Center not found" });
    const { name, contactName, address, email, alternativeEmail, mobile, lat, long, cityId, isSelf, showApp, recommended, testIds = [] } = req.body;
    if (email && email !== existing.email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) return res.status(400).json({ error: "Email already in use" });
    }
    let cityData = {};
    if (cityId === "" || cityId === null) {
      cityData = { cityId: null };
    } else if (cityId !== undefined) {
      const city = await prisma.city.findUnique({ where: { id: Number(cityId) } });
      if (!city) return res.status(400).json({ error: "Invalid cityId" });
      cityData = { cityId: Number(cityId) };
    }
    const testIdNums = Array.isArray(testIds) ? testIds.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    if (testIdNums.length > 0) {
      const validTests = await prisma.test.findMany({ where: { id: { in: testIdNums } }, select: { id: true } });
      const validIds = new Set(validTests.map((t) => t.id));
      const invalidIds = testIdNums.filter((tid) => !validIds.has(tid));
      if (invalidIds.length > 0) return res.status(400).json({ error: `Invalid testIds: ${invalidIds.join(", ")}` });
    }
    await prisma.center.update({
      where: { id: Number(id) },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(contactName !== undefined ? { contactName: contactName ? String(contactName).trim() : null } : {}),
        ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(alternativeEmail !== undefined ? { alternativeEmail: alternativeEmail || null } : {}),
        ...(mobile !== undefined ? { mobile: mobile || null } : {}),
        ...(showApp !== undefined ? { showApp: toBool(showApp, existing.showApp) } : {}),
        ...(isSelf !== undefined ? { isSelf: toBool(isSelf, existing.isSelf) } : {}),
        ...(recommended !== undefined ? { recommended: toBool(recommended, existing.recommended) } : {}),
        ...(lat !== undefined ? { lat: lat === "" || lat === null ? null : Number(lat) } : {}),
        ...(long !== undefined ? { long: long === "" || long === null ? null : Number(long) } : {}),
        ...cityData,
      },
    });
    if (Array.isArray(testIds)) {
      await prisma.centerPackage.deleteMany({ where: { centerId: Number(id) } });
      if (testIdNums.length > 0) {
        await prisma.centerPackage.createMany({ data: testIdNums.map((tid) => ({ centerId: Number(id), testId: tid })) });
      }
    }
    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { city: true, centerPackages: { include: { test: true } } },
    });
    return res.json({ message: "Center updated successfully", center: updated });
  } catch (error) {
    console.error("Error updating center:", error);
    return res.status(500).json({ error: "Failed to update center" });
  }
};

/* ✅ DELETE Center */
export const deleteCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Center not found" });
    await prisma.centerPackage.deleteMany({ where: { centerId: Number(id) } });
    await prisma.center.delete({ where: { id: Number(id) } });
    return res.json({ message: "Center deleted successfully" });
  } catch (error) {
    console.error("Error deleting center:", error);
    return res.status(500).json({ error: "Failed to delete center" });
  }
};

export const getNearbyCenters = async (req, res) => {
  try {
    const { lat, long, radius = 1000, categoryIds } = req.query;
    const userLat = parseFloat(lat);
    const userLong = parseFloat(long);
    const distanceKm = parseFloat(radius);
    if (isNaN(userLat) || isNaN(userLong)) return res.status(400).json({ error: "Latitude and longitude are required and must be numbers" });
    if (isNaN(distanceKm) || distanceKm <= 0) return res.status(400).json({ error: "Radius must be a positive number" });
    let categoryIdList = [];
    if (categoryIds && typeof categoryIds === "string") {
      categoryIdList = categoryIds.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
    }
    const nearbyCenters = await prisma.$queryRaw`
      SELECT c.*, (6371 * acos(cos(radians(${userLat})) * cos(radians(c.lat)) * cos(radians(c.long) - radians(${userLong})) + sin(radians(${userLat})) * sin(radians(c.lat)))) AS distance
      FROM "Center" c WHERE c.lat IS NOT NULL AND c.long IS NOT NULL AND c."showApp" = true
        AND (6371 * acos(cos(radians(${userLat})) * cos(radians(c.lat)) * cos(radians(c.long) - radians(${userLong})) + sin(radians(${userLat})) * sin(radians(c.lat)))) <= ${distanceKm}
      ORDER BY distance ASC LIMIT 200;
    `;
    if (!nearbyCenters || nearbyCenters.length === 0) return res.json({ count: 0, centers: [] });
    const sanitized = nearbyCenters.map((row) => {
      const { password, ...rest } = row;
      return { ...rest, distance: typeof rest.distance === "string" ? parseFloat(rest.distance) : rest.distance };
    });
    const centerIds = sanitized.map((c) => c.id).filter(Boolean);
    if (centerIds.length === 0) return res.json({ count: 0, centers: [] });
    const centerCategories = await prisma.centerCategory.findMany({ where: { centerId: { in: centerIds } }, include: { category: true } });
    let filteredCenters = sanitized;
    if (categoryIdList.length > 0) {
      const centerToCategorySet = new Map();
      for (const cc of centerCategories) {
        if (!centerToCategorySet.has(cc.centerId)) centerToCategorySet.set(cc.centerId, new Set());
        centerToCategorySet.get(cc.centerId).add(cc.categoryId);
      }
      filteredCenters = sanitized.filter((center) => {
        const set = centerToCategorySet.get(center.id);
        if (!set) return false;
        return categoryIdList.every((catId) => set.has(catId));
      });
      if (filteredCenters.length === 0) return res.json({ count: 0, centers: [] });
    }
    const responseCenters = filteredCenters.map((center) => {
      const cats = centerCategories.filter((cc) => cc.centerId === center.id && cc.category).map((cc) => ({ id: cc.category.id, name: cc.category.name }));
      return { ...center, categories: cats };
    });
    return res.json({ count: responseCenters.length, centers: responseCenters });
  } catch (error) {
    console.error("Error fetching nearby centers:", error);
    return res.status(500).json({ error: "Failed to fetch nearby centers" });
  }
};

/* ✅ Assign Categories */
export const assignCategoriesToCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryIds = [] } = req.body;
    const center = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!center) return res.status(404).json({ error: "Center not found" });
    const validCategories = await prisma.category.findMany({ where: { id: { in: categoryIds.map(Number) } }, select: { id: true } });
    const validIds = new Set(validCategories.map((c) => c.id));
    const invalidIds = categoryIds.filter((cid) => !validIds.has(Number(cid)));
    if (invalidIds.length > 0) return res.status(400).json({ error: `Invalid category IDs: ${invalidIds.join(", ")}` });
    await prisma.centerCategory.deleteMany({ where: { centerId: Number(id) } });
    if (categoryIds.length > 0) {
      await prisma.centerCategory.createMany({ data: categoryIds.map((cid) => ({ centerId: Number(id), categoryId: Number(cid) })) });
    }
    const updated = await prisma.center.findUnique({ where: { id: Number(id) }, include: { categories: { include: { category: true } } } });
    return res.json({ message: "Categories assigned successfully", center: updated });
  } catch (error) {
    console.error("Error assigning categories:", error);
    return res.status(500).json({ error: "Failed to assign categories" });
  }
};

/* ✅ Create Slot */
export const createCenterSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, startTime, endTime, capacity = 0 } = req.body;
    const centerId = Number(id);
    const catId = categoryId !== undefined && categoryId !== null ? Number(categoryId) : null;
    const center = await prisma.center.findUnique({ where: { id: centerId } });
    if (!center) return res.status(404).json({ error: "Center not found" });
    if (catId !== null) {
      const category = await prisma.category.findUnique({ where: { id: catId } });
      if (!category) return res.status(404).json({ error: "Category not found" });
    }
    const slot = await prisma.centerSlot.create({ data: { centerId, categoryId: catId, name, startTime, endTime, capacity: Number(capacity) } });
    return res.status(201).json({ message: "Slot created successfully", slot });
  } catch (error) {
    console.error("Error creating slot:", error);
    return res.status(500).json({ error: "Failed to create slot" });
  }
};

export const getCenterSlots = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, includeGlobal = "true", date } = req.query;
    const centerId = Number(id);
    if (!Number.isFinite(centerId)) return res.status(400).json({ error: "Invalid centerId" });
    const catId = categoryId !== undefined && categoryId !== null && categoryId !== "" ? Number(categoryId) : null;
    const target = date ? dayjs.tz(date, "YYYY-MM-DD", TZ) : dayjs().tz(TZ);
    if (!target.isValid()) return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD" });
    const dateStr = target.format("YYYY-MM-DD");
    const dayOfWeek = target.day();
    const dbDate = target.startOf("day").toDate();
    const startOfDay = target.startOf("day").toDate();
    const endOfDay = target.endOf("day").toDate();
    let where = { centerId, isActive: true };
    if (catId !== null) {
      const useGlobal = String(includeGlobal) === "true";
      where = useGlobal
        ? { centerId, isActive: true, OR: [{ categoryId: catId }, { categoryId: null }] }
        : { centerId, isActive: true, categoryId: catId };
    }
    const slots = await prisma.centerSlot.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        category: { select: { id: true, name: true } },
        dayConfigs: { where: { dayOfWeek } },
        dateOverrides: { where: { date: dbDate } },
      },
    });
    const grouped = await prisma.centerSlotBooking.groupBy({
      by: ["centerSlotId"],
      where: { centerId, slotDate: { gte: startOfDay, lte: endOfDay } },
      _count: { _all: true },
      _sum: { quantity: true },
    });
    const bookedMap = new Map(grouped.map((g) => [g.centerSlotId, Number(g._sum?.quantity ?? 0) || g._count._all]));
    const data = slots.map((slot) => {
      const ov = slot.dateOverrides?.[0] || null;
      const dc = slot.dayConfigs?.[0] || null;
      let effectiveCapacity = Number(slot.capacity || 0);
      let capacitySource = "default";
      if (ov) { effectiveCapacity = ov.isActive ? Number(ov.capacity || 0) : 0; capacitySource = "date_override"; }
      else if (dc) { effectiveCapacity = dc.isActive ? Number(dc.capacity || 0) : 0; capacitySource = "day_config"; }
      if (effectiveCapacity <= 0) return null;
      const booked = bookedMap.get(slot.id) || 0;
      const remaining = Math.max(effectiveCapacity - booked, 0);
      return { ...slot, date: dateStr, defaultCapacity: Number(slot.capacity || 0), effectiveCapacity, capacitySource, booked, remaining, isFull: booked >= effectiveCapacity };
    }).filter(Boolean);
    return res.json({ date: dateStr, dayOfWeek, slots: data });
  } catch (error) {
    console.error("Error fetching center slots:", error);
    return res.status(500).json({ error: "Failed to fetch slots" });
  }
};

export const getCenterSlotsForCategories = async (req, res) => {
  try {
    const centerId = Number(req.params.centerId);
    const { date, categoryIds } = req.query;
    if (!Number.isFinite(centerId)) return res.status(400).json({ success: false, error: "Invalid centerId" });
    if (!date) return res.status(400).json({ success: false, error: "date is required (YYYY-MM-DD)" });
    const ids = String(categoryIds || "").split(",").map((x) => Number(x)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return res.status(400).json({ success: false, error: "categoryIds required" });
    const slotDate = new Date(date);
    slotDate.setHours(0, 0, 0, 0);
    const dayOfWeek = slotDate.getDay();
    const centerSlots = await prisma.centerSlot.findMany({
      where: { centerId, isActive: true, categoryId: { in: ids } },
      include: {
        dayConfigs: { where: { dayOfWeek, isActive: true }, orderBy: { dayOfWeek: "asc" } },
        dateOverrides: { where: { date: slotDate, isActive: true }, orderBy: { date: "asc" } },
        bookings: { where: { slotDate }, select: { quantity: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ startTime: "asc" }],
    });
    const computed = centerSlots.map((s) => {
      const effectiveCapacity = s.dateOverrides?.[0]?.capacity ?? s.dayConfigs?.[0]?.capacity ?? s.capacity;
      const booked = (s.bookings ?? []).reduce((sum, b) => sum + (b?.quantity || 0), 0);
      const remaining = Math.max(0, Number(effectiveCapacity || 0) - booked);
      return { centerSlotId: s.id, categoryId: s.categoryId, categoryName: s.category?.name, name: s.name || "", startTime: s.startTime, endTime: s.endTime, effectiveCapacity, booked, remaining };
    });
    const map = new Map();
    for (const s of computed) {
      const key = `${s.name}|${s.startTime}|${s.endTime}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    const requiredCount = ids.length;
    const commonSlots = [];
    for (const [key, list] of map.entries()) {
      const present = new Set(list.map((x) => x.categoryId));
      if (present.size !== requiredCount) continue;
      const remainingCommon = Math.min(...list.map((x) => x.remaining));
      if (remainingCommon <= 0) continue;
      const any = list[0];
      commonSlots.push({ name: any.name, id: any.centerSlotId, startTime: any.startTime, endTime: any.endTime, remaining: remainingCommon, perCategory: list.map((x) => ({ categoryId: x.categoryId, categoryName: x.categoryName, centerSlotId: x.centerSlotId, remaining: x.remaining })) });
    }
    commonSlots.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return res.json({ success: true, date, centerId, categoryIds: ids, slots: commonSlots });
  } catch (err) {
    console.error("getCenterSlotsForCategories error:", err);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

export const updateCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { categoryId, name, startTime, endTime, capacity, isActive } = req.body;
    const id = Number(slotId);
    const slot = await prisma.centerSlot.findUnique({ where: { id } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const catId = categoryId !== undefined && categoryId !== null ? Number(categoryId) : undefined;
    if (catId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: catId } });
      if (!category) return res.status(404).json({ error: "Category not found" });
    }
    const updated = await prisma.centerSlot.update({
      where: { id },
      data: {
        ...(catId !== undefined ? { categoryId: catId } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });
    return res.json({ message: "Slot updated successfully", slot: updated });
  } catch (error) {
    console.error("Error updating slot:", error);
    return res.status(500).json({ error: "Failed to update slot" });
  }
};

export const deleteCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    await prisma.centerSlot.delete({ where: { id: Number(slotId) } });
    return res.json({ message: "Slot deleted successfully" });
  } catch (error) {
    console.error("Error deleting slot:", error);
    return res.status(500).json({ error: "Failed to delete slot" });
  }
};

export const upsertCenterSlotDayConfig = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const { dayOfWeek, capacity, isActive = true } = req.body;
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    if (dayOfWeek === undefined) return res.status(400).json({ error: "dayOfWeek required (0..6)" });
    if (Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) return res.status(400).json({ error: "dayOfWeek must be 0..6" });
    if (capacity === undefined || capacity === null) return res.status(400).json({ error: "capacity required" });
    const slot = await prisma.centerSlot.findUnique({ where: { id: centerSlotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const cfg = await prisma.centerSlotDayConfig.upsert({
      where: { centerSlotId_dayOfWeek: { centerSlotId, dayOfWeek: Number(dayOfWeek) } },
      create: { centerSlotId, dayOfWeek: Number(dayOfWeek), capacity: Number(capacity), isActive: !!isActive },
      update: { capacity: Number(capacity), isActive: !!isActive },
    });
    return res.json({ message: "Day config saved", config: cfg });
  } catch (e) {
    console.error("upsertCenterSlotDayConfig:", e);
    return res.status(500).json({ error: "Failed to save day config" });
  }
};

export const bulkUpsertCenterSlotDayConfig = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const { configs } = req.body;
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    if (!Array.isArray(configs) || configs.length === 0) return res.status(400).json({ error: "configs required" });
    const slot = await prisma.centerSlot.findUnique({ where: { id: centerSlotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const results = await prisma.$transaction(
      configs.map((c) => prisma.centerSlotDayConfig.upsert({
        where: { centerSlotId_dayOfWeek: { centerSlotId, dayOfWeek: Number(c.dayOfWeek) } },
        create: { centerSlotId, dayOfWeek: Number(c.dayOfWeek), capacity: Number(c.capacity), isActive: c.isActive !== undefined ? !!c.isActive : true },
        update: { capacity: Number(c.capacity), isActive: c.isActive !== undefined ? !!c.isActive : true },
      }))
    );
    return res.json({ message: "Bulk day configs saved", configs: results });
  } catch (e) {
    console.error("bulkUpsertCenterSlotDayConfig:", e);
    return res.status(500).json({ error: "Failed to save day configs" });
  }
};

export const getCenterSlotDayConfigs = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    const slot = await prisma.centerSlot.findUnique({ where: { id: centerSlotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const configs = await prisma.centerSlotDayConfig.findMany({ where: { centerSlotId }, orderBy: { dayOfWeek: "asc" } });
    const weekView = Array.from({ length: 7 }, (_, i) => {
      const cfg = configs.find((c) => c.dayOfWeek === i);
      return { dayOfWeek: i, dayName: DAY_NAMES[i], hasConfig: !!cfg, capacity: cfg?.capacity ?? slot.capacity, isActive: cfg?.isActive ?? null };
    });
    return res.json({ centerSlotId, defaultCapacity: slot.capacity, weekView, rawConfigs: configs });
  } catch (e) {
    console.error("getCenterSlotDayConfigs:", e);
    return res.status(500).json({ error: "Failed to fetch day configs" });
  }
};

export const upsertCenterSlotDateOverride = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const { date, capacity, isActive = true, note } = req.body;
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });
    if (capacity === undefined || capacity === null) return res.status(400).json({ error: "capacity required" });
    const parsed = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsed.isValid()) return res.status(400).json({ error: "Invalid date format" });
    const slot = await prisma.centerSlot.findUnique({ where: { id: centerSlotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const dbDate = parsed.startOf("day").toDate();
    const ov = await prisma.centerSlotDateOverride.upsert({
      where: { centerSlotId_date: { centerSlotId, date: dbDate } },
      create: { centerSlotId, date: dbDate, capacity: Number(capacity), isActive: !!isActive, note: note ?? null },
      update: { capacity: Number(capacity), isActive: !!isActive, note: note ?? null },
    });
    return res.json({ message: "Date override saved", override: ov });
  } catch (e) {
    console.error("upsertCenterSlotDateOverride:", e);
    return res.status(500).json({ error: "Failed to save override" });
  }
};

export const bulkUpsertCenterSlotDateOverride = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const { overrides } = req.body;
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    if (!Array.isArray(overrides) || overrides.length === 0) return res.status(400).json({ error: "overrides required" });
    const slot = await prisma.centerSlot.findUnique({ where: { id: centerSlotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const results = await prisma.$transaction(
      overrides.map((o) => {
        const parsed = dayjs.tz(o.date, "YYYY-MM-DD", TZ);
        if (!parsed.isValid()) throw new Error(`Invalid date: ${o.date}`);
        const dbDate = parsed.startOf("day").toDate();
        return prisma.centerSlotDateOverride.upsert({
          where: { centerSlotId_date: { centerSlotId, date: dbDate } },
          create: { centerSlotId, date: dbDate, capacity: Number(o.capacity), isActive: o.isActive !== undefined ? !!o.isActive : true, note: o.note ?? null },
          update: { capacity: Number(o.capacity), isActive: o.isActive !== undefined ? !!o.isActive : true, note: o.note ?? null },
        });
      })
    );
    return res.json({ message: "Bulk overrides saved", overrides: results });
  } catch (e) {
    console.error("bulkUpsertCenterSlotDateOverride:", e);
    return res.status(500).json({ error: "Failed to save overrides" });
  }
};

export const getCenterSlotDateOverrides = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const upcoming = req.query.upcoming === "true";
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    const where = { centerSlotId };
    if (upcoming) where.date = { gte: new Date() };
    const list = await prisma.centerSlotDateOverride.findMany({ where, orderBy: { date: "asc" } });
    const mapped = list.map((o) => {
      const d = dayjs(o.date).tz(TZ);
      return { ...o, dateLabel: d.format("YYYY-MM-DD"), dayName: DAY_NAMES[d.day()] };
    });
    return res.json({ centerSlotId, overrides: mapped, count: mapped.length });
  } catch (e) {
    console.error("getCenterSlotDateOverrides:", e);
    return res.status(500).json({ error: "Failed to fetch overrides" });
  }
};

export const deleteCenterSlotDateOverride = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const { date } = req.params;
    if (!Number.isFinite(centerSlotId)) return res.status(400).json({ error: "Invalid slotId" });
    const parsed = dayjs.tz(date, "YYYY-MM-DD", TZ);
    if (!parsed.isValid()) return res.status(400).json({ error: "Invalid date format" });
    const dbDate = parsed.startOf("day").toDate();
    const del = await prisma.centerSlotDateOverride.deleteMany({ where: { centerSlotId, date: dbDate } });
    if (!del.count) return res.status(404).json({ error: "Override not found" });
    return res.json({ message: "Override deleted" });
  } catch (e) {
    console.error("deleteCenterSlotDateOverride:", e);
    return res.status(500).json({ error: "Failed to delete override" });
  }
};

export const deleteCenterSlotDayConfig = async (req, res) => {
  try {
    const centerSlotId = Number(req.params.slotId);
    const dayOfWeek = Number(req.params.dayOfWeek);
    if (!Number.isFinite(centerSlotId) || !Number.isFinite(dayOfWeek)) return res.status(400).json({ error: "Invalid params" });
    await prisma.centerSlotDayConfig.deleteMany({ where: { centerSlotId, dayOfWeek } });
    return res.json({ message: "Day config removed" });
  } catch (e) {
    console.error("deleteCenterSlotDayConfig:", e);
    return res.status(500).json({ error: "Failed to delete day config" });
  }
};

export const getCenterCategories = async (req, res) => {
  try {
    const centerId = Number(req.params.id);
    const rows = await prisma.centerCategory.findMany({ where: { centerId }, include: { category: true }, orderBy: { id: "asc" } });
    const categories = rows.map((r) => r.category);
    return res.json({ categories });
  } catch (e) {
    console.error("getCenterCategories error:", e);
    return res.status(500).json({ error: "Failed to fetch center categories" });
  }
};

// ─────────────────────────────────────────────────────────────
// GET  /:centerId/commissions
// Returns categories with each test's individual commission
// ─────────────────────────────────────────────────────────────
export const getCenterCategoryCommissions = async (req, res) => {
  try {
    const centerId = Number(req.params.centerId);
    if (!Number.isFinite(centerId) || centerId <= 0) {
      return res.status(400).json({ success: false, message: "Valid centerId required" });
    }

    const rows = await prisma.centerCategoryCommission.findMany({
      where: { centerId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            tests: {
              where: { status: "active" },
              select: { id: true, name: true, offerPrice: true, testType: true },
              orderBy: { name: "asc" },
            },
          },
        },
        commissionTests: {
          include: {
            test: { select: { id: true, name: true, offerPrice: true, testType: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("GET COMMISSIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT  /:centerId/commissions
//
// Body shape:
// {
//   commissions: [
//     {
//       categoryId: 3,
//       isActive: true,
//       tests: [
//         { testId: 12, type: "PERCENT", value: 10 },
//         { testId: 45, type: "AMOUNT",  value: 200 },
//       ]
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────
export const upsertCenterCategoryCommissions = async (req, res) => {
  try {
    const centerId = Number(req.params.centerId);
    const commissions = Array.isArray(req.body?.commissions) ? req.body.commissions : [];

    if (!Number.isFinite(centerId) || centerId <= 0) {
      return res.status(400).json({ success: false, message: "Valid centerId required" });
    }

    for (const c of commissions) {
      const categoryId = Number(c.categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0)
        return res.status(400).json({ success: false, message: "categoryId invalid" });

      const tests = Array.isArray(c.tests) ? c.tests : [];
      for (const t of tests) {
        const testId = Number(t.testId);
        const type   = String(t.type || "PERCENT").toUpperCase();
        const value  = Number(t.value ?? 0);

        if (!Number.isFinite(testId) || testId <= 0)
          return res.status(400).json({ success: false, message: `Invalid testId: ${t.testId}` });
        if (!["PERCENT", "AMOUNT"].includes(type))
          return res.status(400).json({ success: false, message: "type must be PERCENT or AMOUNT" });
        if (!Number.isFinite(value) || value < 0)
          return res.status(400).json({ success: false, message: "value must be >= 0" });
        if (type === "PERCENT" && value > 100)
          return res.status(400).json({ success: false, message: "percent cannot exceed 100" });
      }
    }

    const userId = req.user?.id ? Number(req.user.id) : null;

    await prisma.$transaction(async (tx) => {
      for (const c of commissions) {
        const categoryId = Number(c.categoryId);
        const isActive   = c.isActive !== false;
        const tests      = Array.isArray(c.tests) ? c.tests : [];

        // Upsert category commission (header row — value/type unused now)
        const commission = await tx.centerCategoryCommission.upsert({
          where:  { centerId_categoryId: { centerId, categoryId } },
          create: { centerId, categoryId, type: "PERCENT", value: 0, isActive, createdById: userId },
          update: { isActive },
        });

        // Delete all existing test commissions then re-create
        await tx.centerCategoryCommissionTest.deleteMany({
          where: { commissionId: commission.id },
        });

        if (tests.length > 0) {
          await tx.centerCategoryCommissionTest.createMany({
            data: tests.map((t) => ({
              commissionId: commission.id,
              testId: Number(t.testId),
              type:   String(t.type || "PERCENT").toUpperCase(),
              value:  Number(t.value ?? 0),
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    const fresh = await prisma.centerCategoryCommission.findMany({
      where: { centerId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            tests: {
              where: { status: "active" },
              select: { id: true, name: true, offerPrice: true, testType: true },
              orderBy: { name: "asc" },
            },
          },
        },
        commissionTests: {
          include: {
            test: { select: { id: true, name: true, offerPrice: true, testType: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ success: true, message: "Commissions saved", data: fresh });
  } catch (err) {
    console.error("UPSERT COMMISSIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};