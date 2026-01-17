import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* ---------------- helpers ---------------- */
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalizeShowIn = (showIn) => {
  // allow:
  // - showIn: ["HOME_MIDDLE","HOME_END"] (array)
  // - showIn: "HOME_MIDDLE" (string)
  // - showIn: '["HOME_MIDDLE","HOME_END"]' (stringified JSON)
  if (!showIn) return [];

  if (Array.isArray(showIn)) return showIn;

  if (typeof showIn === "string") {
    const trimmed = showIn.trim();

    // JSON string array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    // single enum value string
    return [trimmed];
  }

  return [];
};

const validateTarget = ({ testId, packageId }) => {
  const hasTest = !!testId;
  const hasPackage = !!packageId;

  if (hasTest && hasPackage) return "Provide either testId OR packageId, not both.";
  if (!hasTest && !hasPackage) return "Provide testId OR packageId.";
  return null;
};

const includeTarget = {
  test: { select: { id: true, name: true } },
  package: { select: { id: true, name: true } },
};

/* ---------------- CREATE Spotlight ---------------- */
export const addSpotlight = async (req, res) => {
  try {
    const testId = toInt(req.body.testId);
    const packageId = toInt(req.body.packageId);
    const showIn = normalizeShowIn(req.body.showIn);

    const err = validateTarget({ testId, packageId });
    if (err) return res.status(400).json({ error: err });

    if (!req.file) return res.status(400).json({ error: "Image is required" });

    if (!showIn.length) {
      return res.status(400).json({ error: "showIn is required (array of places)" });
    }

    // verify target exists
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
        ...(testId ? { testId } : {}),
        ...(packageId ? { packageId } : {}),
        // if you have auth middleware:
        // createdById: req.user?.id ?? null,
      },
      include: includeTarget,
    });

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

/* ---------------- READ ALL Spotlights ---------------- */
export const getAllSpotlights = async (req, res) => {
  try {
    // optional filter: ?showIn=HOME_MIDDLE
    const showInFilter = req.query.showIn ? String(req.query.showIn) : null;

    const where = showInFilter
      ? { showIn: { has: showInFilter } }
      : {};

    const spotlights = await prisma.spotlightBanner.findMany({
      where,
      orderBy: { id: "desc" },
      include: includeTarget,
    });

    res.json(spotlights);
  } catch (error) {
    console.error("Error fetching spotlights:", error);
    res.status(500).json({ error: "Failed to fetch spotlights" });
  }
};

/* ---------------- READ ONE Spotlight ---------------- */
export const getSpotlightById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const spotlight = await prisma.spotlightBanner.findUnique({
      where: { id },
      include: includeTarget,
    });

    if (!spotlight) return res.status(404).json({ error: "Spotlight not found" });

    res.json(spotlight);
  } catch (error) {
    console.error("Error fetching spotlight:", error);
    res.status(500).json({ error: "Failed to fetch spotlight" });
  }
};

/* ---------------- UPDATE Spotlight ---------------- */
export const updateSpotlight = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.spotlightBanner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Spotlight not found" });

    const testId = req.body.testId !== undefined ? toInt(req.body.testId) : undefined;
    const packageId =
      req.body.packageId !== undefined ? toInt(req.body.packageId) : undefined;

    const showIn = req.body.showIn !== undefined
      ? normalizeShowIn(req.body.showIn)
      : undefined;

    // validate target only if changing
    if (testId !== undefined || packageId !== undefined) {
      const nextTestId = testId === undefined ? existing.testId : testId;
      const nextPackageId = packageId === undefined ? existing.packageId : packageId;

      const err = validateTarget({ testId: nextTestId, packageId: nextPackageId });
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

    // showIn validation if provided
    if (showIn !== undefined && !showIn.length) {
      return res.status(400).json({ error: "showIn cannot be empty" });
    }

    // image update
    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) await deleteFromS3(existing.imgUrl);
      imgUrl = await uploadToS3(req.file, "spotlights");
    }

    const updated = await prisma.spotlightBanner.update({
      where: { id },
      data: {
        imgUrl,
        ...(showIn !== undefined ? { showIn } : {}),
        ...(testId !== undefined ? { testId } : {}),
        ...(packageId !== undefined ? { packageId } : {}),
        // updatedById: req.user?.id ?? null, // if you add this field later
      },
      include: includeTarget,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating spotlight:", error);
    res.status(500).json({ error: "Failed to update spotlight" });
  }
};

/* ---------------- DELETE Spotlight ---------------- */
export const deleteSpotlight = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.spotlightBanner.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Spotlight not found" });

    if (existing.imgUrl) await deleteFromS3(existing.imgUrl);

    await prisma.spotlightBanner.delete({ where: { id } });

    res.json({ message: "Spotlight deleted successfully" });
  } catch (error) {
    console.error("Error deleting spotlight:", error);
    res.status(500).json({ error: "Failed to delete spotlight" });
  }
};

/* ---------------- GET Spotlights by showIn ---------------- */
// GET /api/spotlights/show-in/:place  (place=HOME_MIDDLE)
export const getSpotlightsByShowIn = async (req, res) => {
  try {
    const place = String(req.params.place);

    const spotlights = await prisma.spotlightBanner.findMany({
      where: { showIn: { has: place } },
      orderBy: { id: "desc" },
      include: includeTarget,
    });

    res.json(spotlights);
  } catch (error) {
    console.error("Error fetching spotlights by showIn:", error);
    res.status(500).json({ error: "Failed to fetch spotlights" });
  }
};
