import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* -------------------------------------------
   🔵 Helper: Parse selected tests safely
-------------------------------------------- */
function parseTestIds(value) {
  if (!value) return [];

  // Case 1: Already array
  if (Array.isArray(value)) {
    return value.map((id) => Number(id));
  }

  // Case 2: String input
  if (typeof value === "string") {
    // "6,7,8"
    if (value.includes(",")) {
      return value.split(",").map((id) => Number(id.trim()));
    }

    // "[6,7,8]"
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      // "6"
      return [Number(value)];
    }
  }

  return [];
}

/* -------------------------------------------
   🟢 CREATE HEALTH PACKAGE
-------------------------------------------- */
export const addHealthPackage = async (req, res) => {
  try {
    const {
      name,
      description,
      actualPrice,
      offerPrice,
      discount,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      noOfParameter
    } = req.body;

    if (!name || !actualPrice) {
      return res.status(400).json({ error: "Name and actualPrice are required" });
    }

    // Optional image
    let imgUrl = req.file ? await uploadToS3(req.file, "health-packages") : null;

    // Create package
    const healthPackage = await prisma.healthPackage.create({
      data: {
        name,
        description,
        imgUrl,
        actualPrice: Number(actualPrice),
        offerPrice: offerPrice ? Number(offerPrice) : null,
        discount: discount ? Number(discount) : 0,
        showIn,
        reportWithin: Number(reportWithin),
        reportUnit,
        noOfParameter
      }
    });

    // Parse and link tests
    const testIds = parseTestIds(selectedTests);

    if (testIds.length > 0) {
      await prisma.checkupPackage.createMany({
        data: testIds.map((tid) => ({
          checkupId: healthPackage.id,
          testId: tid
        }))
      });
    }

    // Return full package with tests
    const result = await prisma.healthPackage.findUnique({
      where: { id: healthPackage.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("Error creating health package:", error);
    res.status(500).json({ error: "Failed to create health package" });
  }
};

/* -------------------------------------------
   🟡 GET ALL PACKAGES
-------------------------------------------- */
export const getAllHealthPackages = async (req, res) => {
  try {
    const data = await prisma.healthPackage.findMany({
      include: {
        category: { select: { id: true, name: true } },   // <-- added
        checkupPackages: {
          include: { test: true }
        }
      }
    });

    res.json(data);
  } catch (error) {
    console.error("Error fetching packages:", error);
    res.status(500).json({ error: "Failed to fetch health packages" });
  }
};


/* -------------------------------------------
   🔵 GET BY ID
-------------------------------------------- */
export const getHealthPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await prisma.healthPackage.findUnique({
      where: { id: Number(id) },
      include: { checkupPackages: { include: { test: true } } }
    });

    if (!data) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching health package:", error);
    res.status(500).json({ error: "Failed to fetch health package" });
  }
};

/* -------------------------------------------
   🟠 UPDATE HEALTH PACKAGE
-------------------------------------------- */
export const updateHealthPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      description,
      actualPrice,
      offerPrice,
      discount,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      noOfParameter
    } = req.body;

    const existing = await prisma.healthPackage.findUnique({
      where: { id: Number(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    // Replace image if new one uploaded
    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (imgUrl) await deleteFromS3(imgUrl);
      imgUrl = await uploadToS3(req.file, "health-packages");
    }

    // Update main package
    const updated = await prisma.healthPackage.update({
      where: { id: Number(id) },
      data: {
        name,
        description,
        imgUrl,
        actualPrice: actualPrice ? Number(actualPrice) : existing.actualPrice,
        offerPrice: offerPrice ? Number(offerPrice) : existing.offerPrice,
        discount: discount ? Number(discount) : existing.discount,
        showIn: showIn ?? existing.showIn,
        reportWithin: reportWithin ? Number(reportWithin) : existing.reportWithin,
        reportUnit: reportUnit ?? existing.reportUnit,
        noOfParameter: noOfParameter ?? existing.noOfParameter
      }
    });

    // Update test relations
    const testIds = parseTestIds(selectedTests);

    await prisma.checkupPackage.deleteMany({
      where: { checkupId: Number(id) }
    });

    if (testIds.length > 0) {
      await prisma.checkupPackage.createMany({
        data: testIds.map((tid) => ({
          checkupId: updated.id,
          testId: tid
        }))
      });
    }

    const fullData = await prisma.healthPackage.findUnique({
      where: { id: updated.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    res.json(fullData);

  } catch (error) {
    console.error("Error updating health package:", error);
    res.status(500).json({ error: "Failed to update health package" });
  }
};

/* -------------------------------------------
   🔴 DELETE PACKAGE
-------------------------------------------- */
export const deleteHealthPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await prisma.healthPackage.findUnique({
      where: { id: Number(id) }
    });

    if (!pkg) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    if (pkg.imgUrl) await deleteFromS3(pkg.imgUrl);

    await prisma.checkupPackage.deleteMany({
      where: { checkupId: Number(id) }
    });

    await prisma.healthPackage.delete({
      where: { id: Number(id) }
    });

    res.json({ message: "HealthPackage deleted successfully" });

  } catch (error) {
    console.error("Error deleting health package:", error);
    res.status(500).json({ error: "Failed to delete health package" });
  }
};
