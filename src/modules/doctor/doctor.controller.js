import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createDoctor = async (req, res) => {
  try {
    const {
      initial,
      name,
      qualification,
      specialityType,
      speciality,
      mobile,
      landLine,
      email,
      venue,
      refCenter,
      source,
      address,
      otherInfo,
      sendSms,
      sendEmail,
      consultingDoctor,
      number,
    } = req.body;

    if (!name || !number) {
      return res.status(400).json({ message: "Name and number are required" });
    }

    const exist = await prisma.doctor.findUnique({
      where: { number },
    });

    if (exist) {
      return res.status(409).json({ message: "Doctor already exists with this number" });
    }

    const doctor = await prisma.doctor.create({
      data: {
        initial,
        name,
        qualification,
        specialityType,
        speciality,
        mobile,
        landLine,
        email,
        venue,
        refCenter,
        source,
        address,
        otherInfo,
        sendSms: sendSms ?? false,
        sendEmail: sendEmail ?? false,
        consultingDoctor: consultingDoctor ?? false,
        number,
      },
    });

    res.status(201).json({ message: "Doctor created successfully", doctor });
  } catch (error) {
    console.error("Create Doctor Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



export const getDoctors = async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      orderBy: { name: "asc" }, // 🔥 sort alphabetically
    });

    res.status(200).json({ doctors });
  } catch (error) {
    console.error("Get Doctors Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await prisma.doctor.findUnique({
      where: { id: Number(id) },
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.status(200).json({ doctor });
  } catch (error) {
    console.error("Get Doctor Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;

    const existingDoctor = await prisma.doctor.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDoctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const updated = await prisma.doctor.update({
      where: { id: Number(id) },
      data: { ...req.body }, // Automatically updates all fields
    });

    res.status(200).json({
      message: "Doctor updated successfully",
      doctor: updated,
    });
  } catch (error) {
    console.error("Update Doctor Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await prisma.doctor.findUnique({
      where: { id: Number(id) },
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    await prisma.doctor.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({ message: "Doctor deleted successfully" });
  } catch (error) {
    console.error("Delete Doctor Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
