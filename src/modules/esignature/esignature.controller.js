import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* --------------------------
  helpers
-------------------------- */
const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";

const parseIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Boolean);
  return String(value)
    .split(",")
    .map((x) => Number(x.trim()))
    .filter(Boolean);
};

/* ----------------------------------------------------
   CREATE E-SIGNATURE (NEW)
   body:
     name, qualification, designation, alignment
     categories: [1,2,3] or "1,2,3"
     defaultCategoryId: "2" (optional)
---------------------------------------------------- */
export const createESignature = async (req, res) => {
  try {
    const {
      name,
      qualification,
      designation,
      alignment,
      categories,
      defaultCategoryId,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!req.file)
      return res.status(400).json({ error: "Signature image is required" });

    const signatureImg = await uploadToS3(req.file, "esignatures");

    const categoryIds = parseIds(categories);
    const defaultCatId = defaultCategoryId ? Number(defaultCategoryId) : null;

    const created = await prisma.$transaction(async (tx) => {
      // 1) create signature
      const sig = await tx.eSignature.create({
        data: {
          name,
          qualification,
          designation,
          alignment: alignment || "LEFT",
          signatureImg,
        },
      });

      // 2) attach categories
      if (categoryIds.length) {
        await tx.eSignatureCategory.createMany({
          data: categoryIds.map((catId) => ({
            signatureId: sig.id,
            categoryId: catId,
            isDefault: false,
          })),
          skipDuplicates: true,
        });
      }

      // 3) if defaultCategoryId passed → set default for that category
      if (defaultCatId) {
        // unset previous defaults for this category
        await tx.eSignatureCategory.updateMany({
          where: { categoryId: defaultCatId, isDefault: true },
          data: { isDefault: false },
        });

        // ensure link exists + set default
        await tx.eSignatureCategory.upsert({
          where: {
            signatureId_categoryId: {
              signatureId: sig.id,
              categoryId: defaultCatId,
            },
          },
          update: { isDefault: true },
          create: {
            signatureId: sig.id,
            categoryId: defaultCatId,
            isDefault: true,
          },
        });
      }

      return tx.eSignature.findUnique({
        where: { id: sig.id },
        include: {
          categories: { include: { category: true } },
        },
      });
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating e-signature:", error);
    return res.status(500).json({ error: "Failed to create e-signature" });
  }
};

/* ----------------------------------------------------
   GET ALL E-SIGNATURES (NEW)
---------------------------------------------------- */
export const getAllESignatures = async (req, res) => {
  try {
    const signatures = await prisma.eSignature.findMany({
      include: {
        categories: { include: { category: true } },
      },
      orderBy: { id: "desc" }, // (you removed createdAt in ESignature)
    });

    res.json(signatures);
  } catch (error) {
    console.error("Error fetching signatures:", error);
    res.status(500).json({ error: "Failed to fetch signatures" });
  }
};

/* ----------------------------------------------------
   GET SINGLE E-SIGNATURE BY ID (NEW)
---------------------------------------------------- */
export const getESignatureById = async (req, res) => {
  try {
    const signature = await prisma.eSignature.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        categories: { include: { category: true } },
      },
    });

    if (!signature) return res.status(404).json({ error: "E-signature not found" });

    res.json(signature);
  } catch (error) {
    console.error("Error fetching signature:", error);
    res.status(500).json({ error: "Failed to fetch e-signature" });
  }
};

/* ----------------------------------------------------
   UPDATE E-SIGNATURE (NEW)
   body can include:
     name, qualification, designation, alignment
     categories: [1,2,3] or "1,2,3"  (replaces links)
     defaultCategoryId: "2" (optional)
---------------------------------------------------- */
export const updateESignature = async (req, res) => {
  try {
    const { id } = req.params;
    const sigId = Number(id);

    const {
      name,
      qualification,
      designation,
      alignment,
      categories,
      defaultCategoryId,
    } = req.body;

    const existing = await prisma.eSignature.findUnique({
      where: { id: sigId },
      include: { categories: true },
    });

    if (!existing) return res.status(404).json({ error: "E-signature not found" });

    let imgUrl = existing.signatureImg;

    if (req.file) {
      if (existing.signatureImg) await deleteFromS3(existing.signatureImg);
      imgUrl = await uploadToS3(req.file, "esignatures");
    }

    const categoryIds = categories !== undefined ? parseIds(categories) : null;
    const defaultCatId = defaultCategoryId ? Number(defaultCategoryId) : null;

    const updated = await prisma.$transaction(async (tx) => {
      // 1) update signature base fields
      await tx.eSignature.update({
        where: { id: sigId },
        data: {
          name: name ?? existing.name,
          qualification: qualification ?? existing.qualification,
          designation: designation ?? existing.designation,
          alignment: alignment ?? existing.alignment,
          signatureImg: imgUrl,
        },
      });

      // 2) replace categories if provided
      if (categoryIds) {
        // delete old links not in new list
        await tx.eSignatureCategory.deleteMany({
          where: {
            signatureId: sigId,
            categoryId: { notIn: categoryIds.length ? categoryIds : [-1] },
          },
        });

        // create missing links
        if (categoryIds.length) {
          await tx.eSignatureCategory.createMany({
            data: categoryIds.map((catId) => ({
              signatureId: sigId,
              categoryId: catId,
              isDefault: false,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 3) set default for a category if requested
      if (defaultCatId) {
        await tx.eSignatureCategory.updateMany({
          where: { categoryId: defaultCatId, isDefault: true },
          data: { isDefault: false },
        });

        await tx.eSignatureCategory.upsert({
          where: {
            signatureId_categoryId: { signatureId: sigId, categoryId: defaultCatId },
          },
          update: { isDefault: true },
          create: { signatureId: sigId, categoryId: defaultCatId, isDefault: true },
        });
      }

      return tx.eSignature.findUnique({
        where: { id: sigId },
        include: {
          categories: { include: { category: true } },
        },
      });
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating e-signature:", error);
    res.status(500).json({ error: "Failed to update e-signature" });
  }
};

/* ----------------------------------------------------
   DELETE E-SIGNATURE (NEW)
---------------------------------------------------- */
export const deleteESignature = async (req, res) => {
  try {
    const sigId = Number(req.params.id);

    const existing = await prisma.eSignature.findUnique({
      where: { id: sigId },
    });

    if (!existing) return res.status(404).json({ error: "E-signature not found" });

    if (existing.signatureImg) await deleteFromS3(existing.signatureImg);

    // relations will be removed because of onDelete: Cascade
    await prisma.eSignature.delete({ where: { id: sigId } });

    res.json({ message: "E-signature deleted successfully" });
  } catch (error) {
    console.error("Error deleting e-signature:", error);
    res.status(500).json({ error: "Failed to delete e-signature" });
  }
};
