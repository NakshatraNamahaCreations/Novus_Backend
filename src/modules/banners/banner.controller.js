import prisma from '../../lib/prisma.js';
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import redis, { getOrSet } from '../../utils/cache.js';

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:   () =>    'banners:all',
  byId:  (id) => `banners:id:${id}`,
};

const invalidateCaches = async (id = null) => {
  const toDelete = [keys.all()];
  if (id) toDelete.push(keys.byId(id));
  await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export const addBanner = async (req, res) => {
  try {
    const testId    = toInt(req.body.testId);
    const packageId = toInt(req.body.packageId);

    const err = validateTargetOptional({ testId, packageId });
    if (err) return res.status(400).json({ error: err });

    if (!req.file) return res.status(400).json({ error: "Image is required" });

    if (testId) {
      const test = await prisma.test.findUnique({ where: { id: testId } });
      if (!test) return res.status(400).json({ error: "Invalid testId" });
    }

    if (packageId) {
      const pkg = await prisma.healthPackage.findUnique({ where: { id: packageId } });
      if (!pkg) return res.status(400).json({ error: "Invalid packageId" });
    }

    const imgUrl = await uploadToS3(req.file, "banners");

    const banner = await prisma.banner.create({
      data: {
        imgUrl,
        ...(testId    ? { testId }    : {}),
        ...(packageId ? { packageId } : {}),
      },
      include: includeTarget,
    });

    await invalidateCaches();

    return res.status(201).json({
      success: true,
      message: "Banner created successfully",
      banner,
    });
  } catch (error) {
    console.error("Error creating banner:", error);
    return res.status(500).json({ error: "Failed to create banner" });
  }
};

// ─────────────────────────────────────────
//  READ ALL  ── CACHED
// ─────────────────────────────────────────

export const getAllBanners = async (req, res) => {
  try {
    const data = await getOrSet(
      keys.all(),
      CACHE_TTL,
      () => prisma.banner.findMany({
        orderBy: { id: "desc" },
        include: includeTarget,
      })
    );

    return res.json(data);
  } catch (error) {
    console.error("Error fetching banners:", error);
    return res.status(500).json({ error: "Failed to fetch banners" });
  }
};

// ─────────────────────────────────────────
//  READ ONE  ── CACHED
// ─────────────────────────────────────────

export const getBannerById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.banner.findUnique({ where: { id }, include: includeTarget })
    );

    if (!data) return res.status(404).json({ error: "Banner not found" });
    return res.json(data);
  } catch (error) {
    console.error("Error fetching banner:", error);
    return res.status(500).json({ error: "Failed to fetch banner" });
  }
};

// ─────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────

export const updateBanner = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    const testId    = req.body.testId    !== undefined ? toInt(req.body.testId)    : undefined;
    const packageId = req.body.packageId !== undefined ? toInt(req.body.packageId) : undefined;

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

    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) await deleteFromS3(existing.imgUrl);
      imgUrl = await uploadToS3(req.file, "banners");
    }

    const updated = await prisma.banner.update({
      where: { id },
      data: {
        imgUrl,
        ...(testId    !== undefined ? { testId }    : {}),
        ...(packageId !== undefined ? { packageId } : {}),
      },
      include: includeTarget,
    });

    await invalidateCaches(id);

    return res.json(updated);
  } catch (error) {
    console.error("Error updating banner:", error);
    return res.status(500).json({ error: "Failed to update banner" });
  }
};

// ─────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────

export const deleteBanner = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    if (existing.imgUrl) await deleteFromS3(existing.imgUrl);

    await prisma.banner.delete({ where: { id } });

    await invalidateCaches(id);

    return res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    return res.status(500).json({ error: "Failed to delete banner" });
  }
};