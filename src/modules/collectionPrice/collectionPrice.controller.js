import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ---------------- helpers ---------------- */
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v) => {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return null;
};

const normalizePincode = (p) => {
  if (p === undefined || p === null) return null;
  const s = String(p).trim();
  return s.length ? s : null;
};

/**
 * Priority (most specific to least):
 * 1) centerId + pincode
 * 2) centerId + cityId
 * 3) centerId only
 * 4) cityId only
 * 5) global default (all null)
 */
const buildResolveWhere = ({ centerId, cityId, pincode }) => {
  const pc = normalizePincode(pincode);

  return [
    { isActive: true, centerId: centerId ?? undefined, pincode: pc ?? undefined },
    { isActive: true, centerId: centerId ?? undefined, cityId: cityId ?? undefined, pincode: null },
    { isActive: true, centerId: centerId ?? undefined, cityId: null, pincode: null },
    { isActive: true, centerId: null, cityId: cityId ?? undefined, pincode: null },
    { isActive: true, centerId: null, cityId: null, pincode: null },
  ];
};

/* ---------------- CREATE ---------------- */
export const createCollectionPrice = async (req, res) => {
  try {
    const rawCenterId = req.body.centerId;
    const rawCityId = req.body.cityId;

    const centerId =
      rawCenterId === "" || rawCenterId === null || rawCenterId === undefined
        ? null
        : Number(rawCenterId);

    const cityId =
      rawCityId === "" || rawCityId === null || rawCityId === undefined
        ? null
        : Number(rawCityId);

    const pincode =
      req.body.pincode === "" || req.body.pincode === null || req.body.pincode === undefined
        ? null
        : String(req.body.pincode).trim();

    const price = Number(req.body.price);

    // ✅ guard against NaN / 0
    if (centerId !== null && (!Number.isInteger(centerId) || centerId <= 0)) {
      return res.status(400).json({ error: "Invalid centerId" });
    }
    if (cityId !== null && (!Number.isInteger(cityId) || cityId <= 0)) {
      return res.status(400).json({ error: "Invalid cityId" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    // ✅ verify FK exists
    if (centerId) {
      const center = await prisma.center.findUnique({ where: { id: centerId } });
      if (!center) return res.status(400).json({ error: "Center not found (invalid centerId)" });
    }

    if (cityId) {
      const city = await prisma.city.findUnique({ where: { id: cityId } });
      if (!city) return res.status(400).json({ error: "City not found (invalid cityId)" });
    }

    const createdById = req.user?.id ?? null;

    const row = await prisma.collectionPrice.create({
      data: {
        centerId,
        cityId,
        pincode,
        price,
        isActive: true,
        createdById,
      },
      include: {
        center: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Collection price created",
      collectionPrice: row,
    });
  } catch (error) {
    console.error("Error creating collection price:", error);

    // ✅ helpful error for FK
    if (error.code === "P2003") {
      return res.status(400).json({
        error: "Foreign key failed: centerId/cityId does not exist. Please select a valid Center/City.",
        details: error.meta,
      });
    }

    return res.status(500).json({ error: "Failed to create collection price" });
  }
};


/* ---------------- READ ALL (with filters) ---------------- */
export const getCollectionPrices = async (req, res) => {
  try {
    const centerId = toInt(req.query.centerId);
    const cityId = toInt(req.query.cityId);
    const pincode = normalizePincode(req.query.pincode);
    const isActive = req.query.isActive !== undefined ? toBool(req.query.isActive) : undefined;

    const where = {
      ...(centerId !== null && centerId !== undefined ? { centerId } : {}),
      ...(cityId !== null && cityId !== undefined ? { cityId } : {}),
      ...(pincode ? { pincode } : {}),
      ...(isActive !== undefined && isActive !== null ? { isActive } : {}),
    };

    const rows = await prisma.collectionPrice.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { id: "desc" }],
      include: {
        center: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ success: true, collectionPrices: rows });
  } catch (error) {
    console.error("Error fetching collection prices:", error);
    res.status(500).json({ error: "Failed to fetch collection prices" });
  }
};

/* ---------------- READ ONE ---------------- */
export const getCollectionPriceById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const row = await prisma.collectionPrice.findUnique({
      where: { id },
      include: {
        center: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!row) return res.status(404).json({ error: "Collection price not found" });

    res.json({ success: true, collectionPrice: row });
  } catch (error) {
    console.error("Error fetching collection price:", error);
    res.status(500).json({ error: "Failed to fetch collection price" });
  }
};

/* ---------------- UPDATE ---------------- */
export const updateCollectionPrice = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.collectionPrice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Collection price not found" });

    const centerId = req.body.centerId !== undefined ? toInt(req.body.centerId) : undefined;
    const cityId = req.body.cityId !== undefined ? toInt(req.body.cityId) : undefined;
    const pincode = req.body.pincode !== undefined ? normalizePincode(req.body.pincode) : undefined;

    const price = req.body.price !== undefined ? Number(req.body.price) : undefined;
    const isActive = req.body.isActive !== undefined ? toBool(req.body.isActive) : undefined;

    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    // verify foreign keys if changed
    if (centerId !== undefined && centerId) {
      const center = await prisma.center.findUnique({ where: { id: centerId } });
      if (!center) return res.status(400).json({ error: "Invalid centerId" });
    }
    if (cityId !== undefined && cityId) {
      const city = await prisma.city.findUnique({ where: { id: cityId } });
      if (!city) return res.status(400).json({ error: "Invalid cityId" });
    }

    const updated = await prisma.collectionPrice.update({
      where: { id },
      data: {
        ...(centerId !== undefined ? { centerId } : {}),
        ...(cityId !== undefined ? { cityId } : {}),
        ...(pincode !== undefined ? { pincode } : {}),
        ...(price !== undefined ? { price } : {}),
        ...(isActive !== undefined && isActive !== null ? { isActive } : {}),
        // updatedAt auto
      },
      include: {
        center: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ success: true, message: "Updated", collectionPrice: updated });
  } catch (error) {
    console.error("Error updating collection price:", error);
    res.status(500).json({ error: "Failed to update collection price" });
  }
};

/* ---------------- DELETE ---------------- */
export const deleteCollectionPrice = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.collectionPrice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Collection price not found" });

    await prisma.collectionPrice.delete({ where: { id } });

    res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting collection price:", error);
    res.status(500).json({ error: "Failed to delete collection price" });
  }
};

/* ---------------- RESOLVE best price ---------------- */
// GET /api/collection-prices/resolve?centerId=1&cityId=2&pincode=560001
export const resolveCollectionPrice = async (req, res) => {
  try {
    const centerId = toInt(req.query.centerId);
    const cityId = toInt(req.query.cityId);
    const pincode = normalizePincode(req.query.pincode);

    // at least one input is recommended, but not required because default exists
    const conditions = buildResolveWhere({ centerId, cityId, pincode });

    // We try in order and return first match
    for (const where of conditions) {
      // remove undefined keys (Prisma doesn’t like undefined in nested where sometimes)
      const cleanWhere = Object.fromEntries(
        Object.entries(where).filter(([, v]) => v !== undefined)
      );

      const found = await prisma.collectionPrice.findFirst({
        where: cleanWhere,
        orderBy: { id: "desc" }, // latest rule wins
        include: {
          center: { select: { id: true, name: true } },
          city: { select: { id: true, name: true } },
        },
      });

      if (found) {
        return res.json({ success: true, matchType: cleanWhere, collectionPrice: found });
      }
    }

    // no global default present
    return res.status(404).json({
      success: false,
      error: "No collection price rule found. Add a global default (centerId=null, cityId=null, pincode=null).",
    });
  } catch (error) {
    console.error("Error resolving collection price:", error);
    res.status(500).json({ error: "Failed to resolve collection price" });
  }
};
