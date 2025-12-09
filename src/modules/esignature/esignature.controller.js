import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* ----------------------------------------------------
   CREATE E-SIGNATURE
---------------------------------------------------- */
export const createESignature = async (req, res) => {
  try {
    const { name, qualification, designation, categories, alignment, isDefault } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Signature image is required" });
    }

    // Upload signature image
    const signatureImg = await uploadToS3(req.file, "esignatures");

    // Convert categories to array
    const parsedCategories = Array.isArray(categories)
      ? categories
      : categories?.split(",") || [];

    // If new default → remove previous default
    if (isDefault === "true" || isDefault === true) {
      await prisma.eSignature.updateMany({
        data: { isDefault: false },
      });
    }

    const signature = await prisma.eSignature.create({
      data: {
        name,
        qualification,
        designation,
        categories: parsedCategories,
        alignment: alignment || "LEFT",
        isDefault: isDefault === "true" || isDefault === true,
        signatureImg,
      },
    });

    res.status(201).json(signature);
  } catch (error) {
    console.error("Error creating e-signature:", error);
    res.status(500).json({ error: "Failed to create e-signature" });
  }
};

/* ----------------------------------------------------
   GET ALL E-SIGNATURES
---------------------------------------------------- */
export const getAllESignatures = async (req, res) => {
  try {
    const signatures = await prisma.eSignature.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json(signatures);
  } catch (error) {
    console.error("Error fetching signatures:", error);
    res.status(500).json({ error: "Failed to fetch signatures" });
  }
};

/* ----------------------------------------------------
   GET SINGLE E-SIGNATURE BY ID
---------------------------------------------------- */
export const getESignatureById = async (req, res) => {
  try {
    const signature = await prisma.eSignature.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!signature) {
      return res.status(404).json({ error: "E-signature not found" });
    }

    res.json(signature);
  } catch (error) {
    console.error("Error fetching signature:", error);
    res.status(500).json({ error: "Failed to fetch e-signature" });
  }
};

/* ----------------------------------------------------
   UPDATE E-SIGNATURE
---------------------------------------------------- */
export const updateESignature = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, qualification, designation, categories, alignment, isDefault } = req.body;

    const existing = await prisma.eSignature.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "E-signature not found" });
    }

    let imgUrl = existing.signatureImg;

    // Upload new image if provided
    if (req.file) {
      if (existing.signatureImg) {
        await deleteFromS3(existing.signatureImg);
      }
      imgUrl = await uploadToS3(req.file, "esignatures");
    }

    // Convert categories to array
    const parsedCategories = Array.isArray(categories)
      ? categories
      : categories?.split(",") || existing.categories;

    // If setting new default, remove old one
    if (isDefault === "true" || isDefault === true) {
      await prisma.eSignature.updateMany({
        data: { isDefault: false },
      });
    }

    const updated = await prisma.eSignature.update({
      where: { id: Number(id) },
      data: {
        name: name || existing.name,
        qualification: qualification || existing.qualification,
        designation: designation || existing.designation,
        categories: parsedCategories,
        alignment: alignment || existing.alignment,
        isDefault: isDefault === "true" || isDefault === true,
        signatureImg: imgUrl,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating e-signature:", error);
    res.status(500).json({ error: "Failed to update e-signature" });
  }
};

/* ----------------------------------------------------
   DELETE E-SIGNATURE
---------------------------------------------------- */
export const deleteESignature = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.eSignature.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "E-signature not found" });
    }

    // Delete signature image from S3
    if (existing.signatureImg) {
      await deleteFromS3(existing.signatureImg);
    }

    await prisma.eSignature.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "E-signature deleted successfully" });
  } catch (error) {
    console.error("Error deleting e-signature:", error);
    res.status(500).json({ error: "Failed to delete e-signature" });
  }
};
