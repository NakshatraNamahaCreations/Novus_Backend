import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Create Reference Center
export const createReferenceCenter = async (req, res) => {
  try {
    const {
      name,
      contactName,
      address,
      email,
      mobile,
      city,
      state,
      lat,
      long,
      billType,
      paymentType,
      emailReportConfig,
      sendReportMail,
      sendBillMailToPatient
    } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: "Name is required" });

    const ref = await prisma.referenceCenter.create({
      data: {
        name,
        contactName,
        address,
        email,
        mobile,
        city,
        state,
        lat,
        long,
        billType,
        paymentType,
        emailReportConfig,
        sendReportMail,
        sendBillMailToPatient,
        createdById: req.user?.id || null
      }
    });

    res.status(201).json({ success: true, data: ref });
  } catch (error) {
    console.error("Create Reference Center Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get All
export const getReferenceCenters = async (req, res) => {
  try {
    const list = await prisma.referenceCenter.findMany({
      orderBy: { name: "asc" }
    });

    res.json({ success: true, data: list });
  } catch (error) {
    console.error("Get Reference Centers Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get One
export const getReferenceCenterById = async (req, res) => {
  try {
    const { id } = req.params;

    const ref = await prisma.referenceCenter.findUnique({
      where: { id: Number(id) },
      include: { orders: true }
    });

    if (!ref)
      return res.status(404).json({ success: false, message: "Reference Center not found" });

    res.json({ success: true, data: ref });
  } catch (error) {
    console.error("Get Reference Center Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update
export const updateReferenceCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await prisma.referenceCenter.update({
      where: { id: Number(id) },
      data: req.body
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Reference Center Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete
export const deleteReferenceCenter = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.referenceCenter.delete({
      where: { id: Number(id) }
    });

    res.json({ success: true, message: "Reference Center deleted successfully" });
  } catch (error) {
    console.error("Delete Reference Center Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
