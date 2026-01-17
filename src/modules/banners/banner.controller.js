import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* ---------------- helpers ---------------- */
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const validateTarget = ({ testId, packageId }) => {
  const hasTest = !!testId;
  const hasPackage = !!packageId;

  if (hasTest && hasPackage) {
    return "Provide either testId OR packageId, not both.";
  }
  if (!hasTest && !hasPackage) {
    return "Provide testId OR packageId.";
  }
  return null;
};

/* ---------------- CREATE Banner ---------------- */
export const addBanner = async (req, res) => {
  try {
    const testId = toInt(req.body.testId);
    const packageId = toInt(req.body.packageId);

    const err = validateTarget({ testId, packageId });
    if (err) return res.status(400).json({ error: err });

    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    // ✅ verify target exists
    if (testId) {
      const test = await prisma.test.findUnique({ where: { id: testId } });
      if (!test) return res.status(400).json({ error: "Invalid testId" });
    }

    if (packageId) {
      const pkg = await prisma.healthPackage.findUnique({
        where: { id: packageId },
      });
      if (!pkg) return res.status(400).json({ error: "Invalid packageId" });
    }

    const imgUrl = await uploadToS3(req.file, "banners");

    const banner = await prisma.banner.create({
      data: {
        imgUrl,
        ...(testId ? { testId } : {}),
        ...(packageId ? { packageId } : {}),
      },
      include: {
        test: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      },
    });

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

/* ---------------- READ ALL ---------------- */
export const getAllBanners = async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { id: "desc" },
      include: {
        test: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      },
    });
    res.json(banners);
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
};

/* ---------------- READ ONE ---------------- */
export const getBannerById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const banner = await prisma.banner.findUnique({
      where: { id },
      include: {
        test: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      },
    });

    if (!banner) return res.status(404).json({ error: "Banner not found" });

    res.json(banner);
  } catch (error) {
    console.error("Error fetching banner:", error);
    res.status(500).json({ error: "Failed to fetch banner" });
  }
};

/* ---------------- UPDATE ---------------- */
export const updateBanner = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const testId = req.body.testId !== undefined ? toInt(req.body.testId) : undefined;
    const packageId = req.body.packageId !== undefined ? toInt(req.body.packageId) : undefined;

    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    // if user is trying to change target, validate
    if (testId !== undefined || packageId !== undefined) {
      const nextTestId = testId === undefined ? existing.testId : testId;
      const nextPackageId = packageId === undefined ? existing.packageId : packageId;

      const err = validateTarget({
        testId: nextTestId,
        packageId: nextPackageId,
      });
      if (err) return res.status(400).json({ error: err });

      if (nextTestId) {
        const test = await prisma.test.findUnique({ where: { id: nextTestId } });
        if (!test) return res.status(400).json({ error: "Invalid testId" });
      }

      if (nextPackageId) {
        const pkg = await prisma.healthPackage.findUnique({
          where: { id: nextPackageId },
        });
        if (!pkg) return res.status(400).json({ error: "Invalid packageId" });
      }
    }

    // image update
    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) await deleteFromS3(existing.imgUrl);
      imgUrl = await uploadToS3(req.file, "banners");
    }

    const updated = await prisma.banner.update({
      where: { id },
      data: {
        imgUrl,
        ...(testId !== undefined ? { testId } : {}),
        ...(packageId !== undefined ? { packageId } : {}),
      },
      include: {
        test: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating banner:", error);
    res.status(500).json({ error: "Failed to update banner" });
  }
};

/* ---------------- DELETE ---------------- */
export const deleteBanner = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.banner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    if (existing.imgUrl) await deleteFromS3(existing.imgUrl);

    await prisma.banner.delete({ where: { id } });

    res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ error: "Failed to delete banner" });
  }
};
