import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// ✅ CREATE Prescription (Patient Upload)
export const uploadPrescription = async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    // Upload to S3
    const fileUrl = await uploadToS3(req.file, "prescriptions");
    const fileType = req.file.mimetype.includes("pdf") ? "PDF" : "IMAGE";

    const prescription = await prisma.prescription.create({
      data: {
        patientId: Number(patientId),
        fileUrl,
        fileType,
        status: "PENDING_REVIEW",
      },
    });

    res.status(201).json({
      message: "Prescription uploaded successfully",
      data: prescription,
    });
  } catch (error) {
    console.error("Error uploading prescription:", error);
    res.status(500).json({ error: "Failed to upload prescription" });
  }
};

// ✅ GET all prescriptions with pagination + search + status filter
export const getAllPrescriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "" } = req.query;

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    // ✅ Build dynamic WHERE clause
    const whereClause = {};

    // 🔹 Filter by status (if provided)
    if (status) {
      whereClause.status = status;
    }

    // 🔹 Add search condition (patient name / email)
    if (search) {
      whereClause.OR = [
        {
          patient: {
            fullName: { contains: search, mode: "insensitive" },
          },
        },
        {
          patient: {
            contactNo: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    // ✅ Fetch prescriptions (with pagination)
    const [prescriptions, totalCount] = await Promise.all([
      prisma.prescription.findMany({
        where: whereClause,
        include: {
          patient: {
        select: {
          id: true,
          fullName: true,
          contactNo: true,
          isPrimary: true,
        },
      },
          reviewedBy: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.prescription.count({ where: whereClause }),
    ]);

    // ✅ Send response
    return res.status(200).json({
      success: true,
      data: prescriptions,
      meta: {
        total: totalCount,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        limit: pageSize,
      },
    });
  } catch (error) {
    console.error("Error fetching prescriptions:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch prescriptions" });
  }
};


// ✅ GET one prescription
export const getPrescriptionById = async (req, res) => {
  try {
    const { id } = req.params;
    const prescription = await prisma.prescription.findUnique({
      where: { id: Number(id) },
           include: {
           patient: {
           
          select: {
            id: true,
            fullName: true,
            contactNo:true,
            isPrimary:true
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      }
    });

    if (!prescription)
      return res.status(404).json({ error: "Prescription not found" });

    res.json(prescription);
  } catch (error) {
    console.error("Error fetching prescription:", error);
    res.status(500).json({ error: "Failed to fetch prescription" });
  }
};


export const getPrescriptionsByPatientId = async (req, res) => {
  try {
    const { patientId } = req.params;

    const prescriptions = await prisma.prescription.findMany({
      where: {
        patientId: Number(patientId),
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
            isPrimary: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(prescriptions);
  } catch (error) {
    console.error("Error fetching prescriptions by patient ID:", error);
    res.status(500).json({ error: "Failed to fetch prescriptions" });
  }
};


// ✅ UPDATE (Review Prescription → Approve/Reject)
export const reviewPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, reviewedById } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const prescription = await prisma.prescription.update({
      where: { id: Number(id) },
      data: {
        status,
        remarks,
        reviewedById: reviewedById ? Number(reviewedById) : null,
        reviewedAt: new Date(),
      },
    });

    res.json({
      message: "Prescription reviewed successfully",
      data: prescription,
    });
  } catch (error) {
    console.error("Error reviewing prescription:", error);
    res.status(500).json({ error: "Failed to review prescription" });
  }
};

// ✅ DELETE (optional - if you allow deletion)
export const deletePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.prescription.findUnique({
      where: { id: Number(id) },
    });

    if (!existing)
      return res.status(404).json({ error: "Prescription not found" });

    if (existing.fileUrl) {
      await deleteFromS3(existing.fileUrl);
    }

    await prisma.prescription.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Prescription deleted successfully" });
  } catch (error) {
    console.error("Error deleting prescription:", error);
    res.status(500).json({ error: "Failed to delete prescription" });
  }
};
