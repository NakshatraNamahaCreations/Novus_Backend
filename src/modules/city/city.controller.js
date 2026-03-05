import prisma from '../../lib/prisma.js';
import redis, { getOrSet } from '../../utils/cache.js';

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:  ()    => 'cities:all',
  byId: (id)  => `cities:id:${id}`,
};

const invalidateCaches = async (id = null) => {
  const toDelete = [keys.all()];
  if (id) toDelete.push(keys.byId(id));
  await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────

export const createCity = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: "City name required" });

    const city = await prisma.city.create({ data: { name } });

    await invalidateCaches();

    return res.status(201).json({ success: true, data: city });
  } catch (error) {
    console.error("Create City Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  GET ALL  ── CACHED
// ─────────────────────────────────────────

export const getCities = async (req, res) => {
  try {
    const data = await getOrSet(
      keys.all(),
      CACHE_TTL,
      () => prisma.city.findMany({ orderBy: { name: "asc" } })
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("Get Cities Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  GET ONE  ── CACHED
// ─────────────────────────────────────────

export const getCityById = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.city.findUnique({ where: { id: Number(id) } })
    );

    if (!data)
      return res.status(404).json({ success: false, message: "City not found" });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("Get City Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────

export const updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await prisma.city.update({
      where: { id: Number(id) },
      data:  { name },
    });

    await invalidateCaches(id);

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update City Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────

export const deleteCity = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.city.delete({ where: { id: Number(id) } });

    await invalidateCaches(id);

    return res.json({ success: true, message: "City deleted successfully" });
  } catch (error) {
    console.error("Delete City Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};