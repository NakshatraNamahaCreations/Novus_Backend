import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// CREATE or UPDATE (UPSERT)
export const upsertVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { clinicName, specialization, experience, qualification, bio } = req.body;

    const vendor = await prisma.vendor.findUnique({ where: { id: Number(vendorId) } });
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadToS3(req.file, "vendor-profiles");
    }

    const profile = await prisma.vendorProfile.upsert({
      where: { vendorId: Number(vendorId) },
      update: {
        clinicName,
        specialization,
        experience: experience ? Number(experience) : undefined,
        qualification,
        bio,
        ...(photoUrl && { photoUrl }),
      },
      create: {
        vendorId: Number(vendorId),
        clinicName,
        specialization,
        experience: experience ? Number(experience) : null,
        qualification,
        bio,
        photoUrl,
      },
    });

    res.json({ message: "Profile saved successfully", profile });
  } catch (error) {
    console.error("Error saving vendor profile:", error);
    res.status(500).json({ error: "Failed to save vendor profile" });
  }
};

// ✅ UPDATE existing Vendor Profile (only if already exists)
export const updateVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { clinicName, specialization, experience, qualification, bio } = req.body;

    const existing = await prisma.vendorProfile.findUnique({
      where: { vendorId: Number(vendorId) },
    });
    if (!existing) return res.status(404).json({ error: "Profile not found" });

    let photoUrl = existing.photoUrl;

    // If new file is uploaded, replace old one
    if (req.file) {
      if (photoUrl) await deleteFromS3(photoUrl);
      photoUrl = await uploadToS3(req.file, "vendor-profiles");
    }

    const updated = await prisma.vendorProfile.update({
      where: { vendorId: Number(vendorId) },
      data: {
        clinicName,
        specialization,
        experience: experience ? Number(experience) : undefined,
        qualification,
        bio,
        photoUrl,
      },
    });

    res.json({ message: "Profile updated successfully", profile: updated });
  } catch (error) {
    console.error("Error updating vendor profile:", error);
    res.status(500).json({ error: "Failed to update vendor profile" });
  }
};

// GET by Vendor ID
export const getVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const profile = await prisma.vendorProfile.findUnique({
      where: { vendorId: Number(vendorId) },
      include: { vendor: true },
    });

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    res.json(profile);
  } catch (error) {
    console.error("Error fetching vendor profile:", error);
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
};

// DELETE Vendor Profile
export const deleteVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const existing = await prisma.vendorProfile.findUnique({
      where: { vendorId: Number(vendorId) },
    });
    if (!existing) return res.status(404).json({ error: "Profile not found" });

    if (existing.photoUrl) {
      await deleteFromS3(existing.photoUrl);
    }

    await prisma.vendorProfile.delete({ where: { vendorId: Number(vendorId) } });

    res.json({ message: "Vendor profile deleted successfully" });
  } catch (error) {
    console.error("Error deleting vendor profile:", error);
    res.status(500).json({ error: "Failed to delete vendor profile" });
  }
};
