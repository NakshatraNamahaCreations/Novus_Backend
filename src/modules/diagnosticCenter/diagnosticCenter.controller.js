import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// Create Diagnostic Center
export const createDiagnosticCenter = async (req, res) => {
  try {
    const { name, address, pincode, cityId, } = req.body;

    if (!name || !cityId)
      return res.status(400).json({ success: false, message: "Name & cityId required" });

    const dc = await prisma.diagnosticCenter.create({
      data: {
        name,
        address,
        pincode,
        cityId: Number(cityId),
        createdById: req.user?.id || null
      }
    });

    res.status(201).json({ success: true, data: dc });
  } catch (error) {
    console.error("Create Diagnostic Center Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get All Diagnostic Centers
export const getDiagnosticCenters = async (req, res) => {
  try {
    const list = await prisma.diagnosticCenter.findMany({
      include: {
        city: true,
      
      }
    });

    res.json({ success: true, data: list });
  } catch (error) {
    console.error("Get Diagnostic Centers Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Single Diagnostic Center
export const getDiagnosticCenterById = async (req, res) => {
  try {
    const { id } = req.params;

    const dc = await prisma.diagnosticCenter.findUnique({
      where: { id: Number(id) },
      include: { city: true, centers: true }
    });

    if (!dc)
      return res.status(404).json({ success: false, message: "Diagnostic Center not found" });

    res.json({ success: true, data: dc });
  } catch (error) {
    console.error("Get DC Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update Diagnostic Center
export const updateDiagnosticCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, pincode, cityId } = req.body;

    const updated = await prisma.diagnosticCenter.update({
      where: { id: Number(id) },
      data: { name, address, pincode, cityId: Number(cityId) }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update DC Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete Diagnostic Center
export const deleteDiagnosticCenter = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.diagnosticCenter.delete({
      where: { id: Number(id) }
    });

    res.json({ success: true, message: "Diagnostic Center deleted successfully" });
  } catch (error) {
    console.error("Delete DC Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
