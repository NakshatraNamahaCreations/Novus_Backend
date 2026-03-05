import prisma from '../../lib/prisma.js';
import redis, { getOrSet } from '../../utils/cache.js';

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:  ()   => 'sources:all',
  byId: (id) => `sources:id:${id}`,
};

const invalidateCaches = async (id = null) => {
  const toDelete = [keys.all()];
  if (id) toDelete.push(keys.byId(id));
  await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────

export const createSource = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: "Source name is required" });

    const source = await prisma.sources.create({ data: { name } });

    await invalidateCaches();

    return res.status(201).json({ success: true, data: source });
  } catch (error) {
    console.error("Error creating source:", error);
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
      () => prisma.sources.findMany({ orderBy: { name: "asc" } })
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching sources:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  GET ONE  ── CACHED
// ─────────────────────────────────────────

export const getSourceById = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.sources.findUnique({ where: { id: Number(id) } })
    );

    if (!data)
      return res.status(404).json({ success: false, message: "Source not found" });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching source:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────

export const updateSource = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedSource = await prisma.sources.update({
      where: { id: Number(id) },
      data:  { name },
    });

    await invalidateCaches(id);

    return res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error("Error updating source:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────

export const deleteSource = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.sources.delete({ where: { id: Number(id) } });

    await invalidateCaches(id);

    return res.json({ success: true, message: "Source deleted successfully" });
  } catch (error) {
    console.error("Error deleting source:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};