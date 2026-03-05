import prisma from '../../lib/prisma.js';
import redis, { getOrSet } from '../../utils/cache.js';

// ── Cache Config ───────────────────────────────────────────────
const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:    ()  => 'pincodes:all',
  byId:   (id) => `pincodes:id:${id}`,
  search: (q)  => `pincodes:search:${q}`,
};

const invalidateListCaches = async (id = null) => {
  const toDelete = [keys.all()];
  if (id) toDelete.push(keys.byId(id));

  const searchKeys = await redis.keys('pincodes:search:*');
  toDelete.push(...searchKeys);

  if (toDelete.length) await redis.del(...toDelete);
};

// ── CREATE PINCODE ─────────────────────────────────────────────
export const createPincode = async (req, res) => {
  try {
    const { pincode, city, state, area } = req.body;

    if (!pincode) {
      return res.status(400).json({ error: 'Pincode is required' });
    }

    const exists = await prisma.pincode.findUnique({
      where: { pincode },
    });

    if (exists) {
      return res.status(409).json({ error: 'Pincode already exists' });
    }

    const newPincode = await prisma.pincode.create({
      data: { pincode, city, state, area },
    });

    await invalidateListCaches();

    res.status(201).json({ success: true, data: newPincode });
  } catch (error) {
    console.error('Create Pincode Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ── GET ALL PINCODES ───────────────────────────────────────────
export const getPincodes = async (req, res) => {
  try {
    const data = await getOrSet(
      keys.all(),
      CACHE_TTL,
      () => prisma.pincode.findMany({ orderBy: { id: 'desc' } })
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get Pincodes Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ── GET ONE PINCODE BY ID ──────────────────────────────────────
export const getPincodeById = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.pincode.findUnique({ where: { id: Number(id) } })
    );

    if (!data) {
      return res.status(404).json({ error: 'Pincode not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get Pincode By ID Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ── SEARCH PINCODE OR AREA ─────────────────────────────────────
export const searchPincodes = async (req, res) => {
  try {
    const { query } = req.params;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const data = await getOrSet(
      keys.search(query.trim().toLowerCase()),
      CACHE_TTL,
      () =>
        prisma.pincode.findMany({
          where: {
            OR: [
              { pincode: { contains: query } },
              { city:    { contains: query, mode: 'insensitive' } },
              { area:    { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { pincode: 'asc' },
        })
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('Search Pincodes Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ── UPDATE PINCODE ─────────────────────────────────────────────
export const updatePincode = async (req, res) => {
  try {
    const { id } = req.params;
    const { pincode, city, state, area } = req.body;

    const exists = await prisma.pincode.findUnique({
      where: { id: Number(id) },
    });

    if (!exists) {
      return res.status(404).json({ error: 'Pincode not found' });
    }

    // If pincode value is changing, check it won't conflict with another record
    if (pincode && pincode !== exists.pincode) {
      const conflict = await prisma.pincode.findUnique({
        where: { pincode },
      });
      if (conflict) {
        return res.status(409).json({ error: 'Pincode value already in use' });
      }
    }

    const updated = await prisma.pincode.update({
      where: { id: Number(id) },
      data: { pincode, city, state, area },
    });

    await invalidateListCaches(id);

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update Pincode Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ── DELETE PINCODE ─────────────────────────────────────────────
export const deletePincode = async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await prisma.pincode.findUnique({
      where: { id: Number(id) },
    });

    if (!exists) {
      return res.status(404).json({ error: 'Pincode not found' });
    }

    await prisma.pincode.delete({
      where: { id: Number(id) },
    });

    await invalidateListCaches(id);

    res.json({ success: true, message: 'Pincode deleted successfully' });
  } catch (error) {
    console.error('Delete Pincode Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};