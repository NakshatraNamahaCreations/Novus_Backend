import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import prisma from '../../lib/prisma.js';
import redis, { getOrSet } from '../../utils/cache.js';

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:      (showIn) => `spotlights:all:${showIn || ''}`,
  byId:     (id)     => `spotlights:id:${id}`,
  byPlace:  (place)  => `spotlights:place:${place}`,
};

const invalidateCaches = async (id = null) => {
  const [allKeys, placeKeys] = await Promise.all([
    redis.keys('spotlights:all:*'),
    redis.keys('spotlights:place:*'),
  ]);

  const toDelete = [...allKeys, ...placeKeys];
  if (id) toDelete.push(keys.byId(id));

  if (toDelete.length) await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalizeShowIn = (showIn) => {
  if (!showIn) return [];
  if (Array.isArray(showIn)) return showIn;
  if (typeof showIn === "string") {
    const trimmed = showIn.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [trimmed];
  }
  return [];
};

const validateTargetOptional = ({ testId, packageId }) => {
  if (!!testId && !!packageId) return "Provide either testId OR packageId, not both.";
  return null;
};

const includeTarget = {
  test:    { select: { id: true, name: true } },
  package: { select: { id: true, name: true } },
};

// ─────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────

export const addSpotlight = async (req, res) => {
  try {
    const testId    = toInt(req.body.testId);
    const packageId = toInt(req.body.packageId);
    const showIn    = normalizeShowIn(req.body.showIn);

    const err = validateTargetOptional({ testId, packageId });
    if (err) return res.status(400).json({ error: err });

    if (!req.file)       return res.status(400).json({ error: "Image is required" });
    if (!showIn.length)  return res.status(400).json({ error: "showIn is required (array of places)" });

    if (testId) {
      const test = await prisma.test.findUnique({ where: { id: testId } });
      if (!test) return res.status(400).json({ error: "Invalid testId" });
    }

    if (packageId) {
      const pkg = await prisma.healthPackage.findUnique({ where: { id: packageId } });
      if (!pkg) return res.status(400).json({ error: "Invalid packageId" });
    }

    const imgUrl = await uploadToS3(req.file, "spotlights");

    const spotlight = await prisma.spotlightBanner.create({
      data: {
        imgUrl,
        showIn,
        ...(testId    ? { testId }    : {}),
        ...(packageId ? { packageId } : {}),
      },
      include: includeTarget,
    });

    await invalidateCaches();

    return res.status(201).json({
      success: true,
      message: "Spotlight created successfully",
      spotlight,
    });
  } catch (error) {
    console.error("Error creating spotlight:", error);
    return res.status(500).json({ error: "Failed to create spotlight" });
  }
};

// ─────────────────────────────────────────
//  READ ALL  ── CACHED
// ─────────────────────────────────────────

export const getAllSpotlights = async (req, res) => {
  try {
    const showInFilter = req.query.showIn ? String(req.query.showIn) : null;

    const data = await getOrSet(
      keys.all(showInFilter),
      CACHE_TTL,
      () => prisma.spotlightBanner.findMany({
        where:   showInFilter ? { showIn: { has: showInFilter } } : {},
        orderBy: { id: "desc" },
        include: includeTarget,
      })
    );

    return res.json(data);
  } catch (error) {
    console.error("Error fetching spotlights:", error);
    return res.status(500).json({ error: "Failed to fetch spotlights" });
  }
};

// ─────────────────────────────────────────
//  READ ONE  ── CACHED
// ─────────────────────────────────────────

export const getSpotlightById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.spotlightBanner.findUnique({ where: { id }, include: includeTarget })
    );

    if (!data) return res.status(404).json({ error: "Spotlight not found" });
    return res.json(data);
  } catch (error) {
    console.error("Error fetching spotlight:", error);
    return res.status(500).json({ error: "Failed to fetch spotlight" });
  }
};

// ─────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────

export const updateSpotlight = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.spotlightBanner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Spotlight not found" });

    const testId    = req.body.testId    !== undefined ? toInt(req.body.testId)    : undefined;
    const packageId = req.body.packageId !== undefined ? toInt(req.body.packageId) : undefined;
    const showIn    = req.body.showIn    !== undefined ? normalizeShowIn(req.body.showIn) : undefined;

    if (testId !== undefined || packageId !== undefined) {
      const nextTestId    = testId    === undefined ? existing.testId    : testId;
      const nextPackageId = packageId === undefined ? existing.packageId : packageId;

      const err = validateTargetOptional({ testId: nextTestId, packageId: nextPackageId });
      if (err) return res.status(400).json({ error: err });

      if (nextTestId) {
        const test = await prisma.test.findUnique({ where: { id: nextTestId } });
        if (!test) return res.status(400).json({ error: "Invalid testId" });
      }

      if (nextPackageId) {
        const pkg = await prisma.healthPackage.findUnique({ where: { id: nextPackageId } });
        if (!pkg) return res.status(400).json({ error: "Invalid packageId" });
      }
    }

    if (showIn !== undefined && !showIn.length) {
      return res.status(400).json({ error: "showIn cannot be empty" });
    }

    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) await deleteFromS3(existing.imgUrl);
      imgUrl = await uploadToS3(req.file, "spotlights");
    }

    const updated = await prisma.spotlightBanner.update({
      where: { id },
      data: {
        imgUrl,
        ...(showIn    !== undefined ? { showIn }    : {}),
        ...(testId    !== undefined ? { testId }    : {}),
        ...(packageId !== undefined ? { packageId } : {}),
      },
      include: includeTarget,
    });

    await invalidateCaches(id);

    return res.json(updated);
  } catch (error) {
    console.error("Error updating spotlight:", error);
    return res.status(500).json({ error: "Failed to update spotlight" });
  }
};

// ─────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────

export const deleteSpotlight = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.spotlightBanner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Spotlight not found" });

    if (existing.imgUrl) await deleteFromS3(existing.imgUrl);

    await prisma.spotlightBanner.delete({ where: { id } });

    await invalidateCaches(id);

    return res.json({ message: "Spotlight deleted successfully" });
  } catch (error) {
    console.error("Error deleting spotlight:", error);
    return res.status(500).json({ error: "Failed to delete spotlight" });
  }
};

// ─────────────────────────────────────────
//  BY SHOW-IN PLACE  ── CACHED
// ─────────────────────────────────────────

export const getSpotlightsByShowIn = async (req, res) => {
  try {
    const place = String(req.params.place);

    const data = await getOrSet(
      keys.byPlace(place),
      CACHE_TTL,
      () => prisma.spotlightBanner.findMany({
        where:   { showIn: { has: place } },
        orderBy: { id: "desc" },
        include: includeTarget,
      })
    );

    return res.json(data);
  } catch (error) {
    console.error("Error fetching spotlights by showIn:", error);
    return res.status(500).json({ error: "Failed to fetch spotlights" });
  }
};