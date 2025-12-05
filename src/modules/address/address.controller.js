import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/* ------------------------- CREATE ADDRESS ------------------------- */
export const createAddress = async (req, res) => {
  try {
    const {
      patientId,
      saveas,
      address,
      landmark,
      city,
      state,
      pincode,
      latitude,
      longitude,
    } = req.body;

    if (!address || !city || !state || !pincode) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    // ✅ Step 1: Validate patient (if provided)
    let patient = null;
    if (patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: Number(patientId) },
      });
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
    }

    // ✅ Step 2: Create Address linked to patient (if any)
    const newAddress = await prisma.address.create({
      data: {
        saveas,
        address,
        landmark,
        city,
        state,
        pincode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        ...(patientId && { patientId: Number(patientId) }), // link if patientId provided
      },
    });

    res.status(201).json({
      message: "Address created successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({ error: "Failed to create address" });
  }
};

/* ------------------------- GET ALL ADDRESSES ------------------------- */
export const getAllAddresses = async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(addresses);
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
};

/* ------------------------- GET ADDRESS BY ID ------------------------- */
export const getAddressById = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await prisma.address.findUnique({
      where: { id: Number(id) },
    });

    if (!address)
      return res.status(404).json({ error: "Address not found" });

    res.json(address);
  } catch (error) {
    console.error("Error fetching address:", error);
    res.status(500).json({ error: "Failed to fetch address" });
  }
};

/* ------------------------- UPDATE ADDRESS ------------------------- */
export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      saveas,
      address,
      landmark,
      city,
      state,
      pincode,
      latitude,
      longitude,
    } = req.body;

    const existing = await prisma.address.findUnique({
      where: { id: Number(id) },
    });
    if (!existing)
      return res.status(404).json({ error: "Address not found" });

    const updated = await prisma.address.update({
      where: { id: Number(id) },
      data: {
        saveas,
        address,
        landmark,
        city,
        state,
        pincode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
      },
    });

    res.json({
      message: "Address updated successfully",
      address: updated,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: "Failed to update address" });
  }
};

/* ------------------------- DELETE ADDRESS ------------------------- */
export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.address.findUnique({
      where: { id: Number(id) },
    });
    if (!existing)
      return res.status(404).json({ error: "Address not found" });

    await prisma.address.delete({ where: { id: Number(id) } });

    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: "Failed to delete address" });
  }
};

/* ------------------------- GET ADDRESSES BY PATIENT ID ------------------------- */
export const getAddressByPatientId = async (req, res) => {
  try {
    const { patientId } = req.params;

    // ✅ Fetch the patient and include all addresses
    const patient = await prisma.patient.findUnique({
      where: { id: Number(patientId) },
      include: { addresses: true },
    });

    if (!patient)
      return res.status(404).json({ error: "Patient not found" });

    if (!patient.addresses || patient.addresses.length === 0)
      return res
        .status(404)
        .json({ error: "No addresses found for this patient" });

    res.json({
      patient: {
        id: patient.id,
        fullName: patient.fullName,
      },
      addresses: patient.addresses, // ✅ fixed plural name
    });
  } catch (error) {
    console.error("Error fetching address by patient:", error);
    res.status(500).json({ error: "Failed to fetch address by patient" });
  }
};
