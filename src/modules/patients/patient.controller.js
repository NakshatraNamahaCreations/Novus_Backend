import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import { sendOtpSms } from "../../utils/sendOtpSms.js";
import { whatsappQueue } from "../../queues/whatsapp.queue.js";

const prisma = new PrismaClient();

// Generate OTP
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Calculate age if dob is given
const calculateAge = (dob) => {
  if (!dob) return null;
  const now = dayjs();
  const birthDate = dayjs(dob);
  return now.diff(birthDate, "year");
};

export const createPatient = async (req, res) => {
  try {
    const {
      fullName,
      email,
      contactNo,
      dob,
      gender,
      bloodType,
      height,
      weight,
      smokingHabit,
      alcoholConsumption,
      exerciseFrequency,
      relationship,
      status,
      isPrimary,
      age,
      passportNo,
      aadharNo,
      address,
      initial,
    } = req.body;

    // Basic validation
    if (!fullName || !contactNo) {
      return res.status(400).json({
        success: false,
        error: "Full name and contact number are required",
      });
    }

    const patient = await prisma.patient.create({
      data: {
        fullName,
        email: email || null,
        contactNo,
        dob: dob ? new Date(dob) : null,
        age: Number(age) || null,
        gender: gender || null,
        bloodType: bloodType || null,
        height: height || null,
        weight: weight || null,
        smokingHabit: smokingHabit || null,
        alcoholConsumption: alcoholConsumption || null,
        exerciseFrequency: exerciseFrequency || null,
        relationship: relationship || "self",
        status: status || "active",
        isPrimary: isPrimary !== undefined ? isPrimary : true,
        passportNo,
        aadharNo,
        address,
        initial,
      },
    });

    await whatsappQueue.add(
      "whatsapp.welcomeNewPatient", // 👈 keep it consistent with worker routing
      {
        contactNo,
        patientName: patient?.fullName || "Customer",
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    res.status(201).json({
      success: true,
      message: "Patient created successfully",
      patient,
    });
  } catch (error) {
    console.error("Error creating patient:", error);

    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        error: "Patient with this email or contact number already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create patient",
    });
  }
};

// LOGIN or REGISTER
export const loginOrRegister = async (req, res) => {
  try {
    const { contactNo } = req.body;
    if (!contactNo) {
      return res.status(400).json({ error: "Contact number required" });
    }

    const otp = generateOtp();
    const otpExpiry = dayjs().add(5, "minute").toDate();

    let patient = await prisma.patient.findFirst({
      where: { contactNo },
    });

    if (patient) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { otp, otpExpiry },
      });

      await sendOtpSms(contactNo, otp);

      return res.json({
        message: "OTP sent successfully",
        contactNo,
        isNew: false,
        otp: otp,
      });
    }

    patient = await prisma.patient.create({
      data: {
        contactNo,
        otp,
        otpExpiry,
        relationship: "Self",
        isPrimary: true,
      },
    });

    await sendOtpSms(contactNo, otp);

    return res.json({
      message: "Account created & OTP sent",
      contactNo,
      isNew: true,
    });
  } catch (error) {
    console.error("Error login/register:", error);
    return res.status(500).json({ error: "Failed to login/register" });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { contactNo, otp, fcmToken, platform } = req.body;

    const patient = await prisma.patient.findFirst({
      where: { contactNo },
    });

    if (!patient) {
      return res.status(400).json({ error: "Patient not found" });
    }

    if (patient.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (dayjs().isAfter(patient.otpExpiry)) {
      return res.status(400).json({ error: "OTP expired" });
    }

    // ✅ Clear OTP
    await prisma.patient.update({
      where: { id: patient.id },
      data: { otp: null, otpExpiry: null },
    });

    // ✅ SAVE / UPDATE DEVICE (IMPORTANT)
    if (fcmToken) {
      await prisma.patientDevice.upsert({
        where: { fcmToken },
        update: {
          patientId: patient.id,
          platform: platform || "unknown",
        },
        create: {
          patientId: patient.id,
          fcmToken,
          platform: platform || "unknown",
        },
      });
    }

    // after patient create + sendOtpSms
    await whatsappQueue.add(
      "whatsapp.welcomeNewPatient", // 👈 keep it consistent with worker routing
      {
        contactNo,
        patientName: patient?.fullName || "Customer",
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return res.json({
      message: "Login successful",
      patient: patient,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
};

// RESEND OTP
export const resendOtp = async (req, res) => {
  try {
    const { contactNo } = req.body;
    if (!contactNo) {
      return res.status(400).json({ error: "Contact number required" });
    }

    const patient = await prisma.patient.findUnique({
      where: { contactNo },
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const otp = generateOtp();
    const otpExpiry = dayjs().add(5, "minute").toDate();

    await prisma.patient.update({
      where: { contactNo },
      data: { otp, otpExpiry },
    });

    await sendOtpSms(contactNo, otp);

    return res.json({
      message: "OTP resent successfully",
      contactNo,
      otp: otp,
    });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ error: "Failed to resend OTP" });
  }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    console.log("data", data);

    // calculate age if dob is provided
    if (data.dob) {
      data.age = calculateAge(data.dob);
      data.dob = new Date(data.dob);
    }

    const updated = await prisma.patient.update({
      where: { id: Number(id) },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// ADD FAMILY MEMBER
export const addFamilyMember = async (req, res) => {
  try {
    const { primaryId } = req.params;
    const { fullName, dob, gender, email, bloodType, relationship, contactNo } =
      req.body;
    console.log("contactNo", contactNo);
    const data = {
      fullName,
      dob: dob ? new Date(dob) : null,
      age: dob ? calculateAge(dob) : null,
      gender,
      email,
      bloodType,
      relationship,
      isPrimary: false,
      primaryId: Number(primaryId),
      contactNo: contactNo,
    };

    const member = await prisma.patient.create({ data });

    res.status(201).json(member);
  } catch (error) {
    console.error("Error adding family member:", error);
    res.status(500).json({ error: "Failed to add family member" });
  }
};

// GET FAMILY MEMBERS
export const getFamilyMembers = async (req, res) => {
  try {
    const { primaryId } = req.params;
    const members = await prisma.patient.findMany({
      where: { primaryId: Number(primaryId) },
    });

    res.json(members);
  } catch (error) {
    console.error("Error fetching family members:", error);
    res.status(500).json({ error: "Failed to fetch family members" });
  }
};

// ✅ GET SINGLE PATIENT BY ID
export const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(id) },
      include: {
        addresses: true,
        primary: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
            email: true,
          },
        },
        familyMembers: {
          select: {
            id: true,
            fullName: true,
            dob: true,
            gender: true,
            relationship: true,
            contactNo: true,
          },
        },
        prescriptions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            reviewedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: "Patient not found",
      });
    }

    res.json({
      success: true,
      patient,
    });
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch patient details",
    });
  }
};

// UPDATE FAMILY MEMBER
export const updateFamilyMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    let data = { ...req.body };

    // ✅ Convert dob string to valid Date
    if (data.dob) {
      data.dob = new Date(data.dob); // JS date
    }

    const updated = await prisma.patient.update({
      where: { id: Number(memberId) },
      data,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating family member:", error);
    res.status(500).json({ error: "Failed to update family member" });
  }
};

// DELETE FAMILY MEMBER
export const deleteFamilyMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    await prisma.patient.delete({ where: { id: Number(memberId) } });
    res.json({ message: "Family member removed successfully" });
  } catch (error) {
    console.error("Error deleting family member:", error);
    res.status(500).json({ error: "Failed to delete family member" });
  }
};

// LOGOUT (just placeholder, no session handling yet)
export const logout = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "patientId is required" });
    }

    const deleted = await prisma.patientDevice.deleteMany({
      where: {
        patientId: Number(id),
      },
    });

    return res.json({
      success: true,
      message: "Logged out successfully from all devices",
      devicesRemoved: deleted.count,
    });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Logout failed" });
  }
};

// UPDATE STATUS
export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await prisma.patient.update({
      where: { id: Number(id) },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
};

/* ---------------------- GET ALL PATIENTS ---------------------- */
export const getAllPatients = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", status = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const where = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { contactNo: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const patients = await prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        primary: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
            email: true,
          },
        },
      },
    });

    const total = await prisma.patient.count({ where });
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      patients,
      meta: {
        currentPage: page,
        totalPages,
        total,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch patients",
    });
  }
};


export const getPatientByMobile = async (req, res) => {
  try {
    const { mobile } = req.query;

    if (!mobile) {
      return res
        .status(400)
        .json({ success: false, message: "Mobile required" });
    }

    const patient = await prisma.patient.findFirst({
      where: { contactNo: mobile },
      include: {
        addresses: true,
        orders: true,
      },
    });

    return res.json({
      success: true,
      exists: !!patient,
      patient,
    });
  } catch (error) {
    console.error("Fetch patient error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
