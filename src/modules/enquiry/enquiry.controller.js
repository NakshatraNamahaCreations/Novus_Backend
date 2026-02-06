import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALLOWED_STATUS = new Set(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pickUpdatedById = (req) => {
  // Prefer auth user if available
  if (req.user?.id) return req.user.id;

  // else allow from body/query
  const fromBody = toInt(req.body?.updatedById);
  if (fromBody) return fromBody;

  return null;
};

const ok = (res, message, data = null) =>
  res.status(200).json({ success: true, message, data });

const created = (res, message, data = null) =>
  res.status(201).json({ success: true, message, data });

const bad = (res, message, extra = {}) =>
  res.status(400).json({ success: false, message, ...extra });

const notFound = (res, message = "Not found") =>
  res.status(404).json({ success: false, message });

export const createEnquiry = async (req, res) => {
  try {
    const cleanStatus = "NEW";
    if (!ALLOWED_STATUS.has(cleanStatus)) {
      return bad(res, `Invalid status. Allowed: ${Array.from(ALLOWED_STATUS).join(", ")}`);
    }

    // ✅ patientId from token
    const patientId = req.user?.id;
    const number=req.body?.number;
    const name=req.body?.name;
    if (!patientId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized (patientId missing in token)" });
    }

    // ✅ fetch patient details
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        fullName: true,
        contactNo: true,
        email: true,
      },
    });

    if (!patient) {
      return notFound(res, "Patient not found");
    }

    if (!patient.contactNo) {
      return bad(res, "Patient phone number (contactNo) is missing");
    }

    // ✅ use patient data for enquiry
    const enquiry = await prisma.enquiry.create({
      data: {
        name: name ? name : patient.fullName ,
        number: number ? number : patient.contactNo,
        status: cleanStatus,
        patientId: patient.id,
      },
      
    });

    return created(res, "Enquiry created", );
  } catch (err) {
    console.error("createEnquiry error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getEnquiries = async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      page = "1",
      limit = "20",
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // ✅ pagination (frontend expects pages/total/items)
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // ✅ sorting (frontend sends sortBy=createdAt|updatedAt and order=asc|desc)
    const sortField = ["createdAt", "updatedAt"].includes(sortBy)
      ? sortBy
      : "createdAt";
    const sortOrder = String(order).toLowerCase() === "asc" ? "asc" : "desc";

    const where = {};

    // ✅ status filter
    if (status) {
      const st = String(status);
      if (!ALLOWED_STATUS.has(st)) {
        return bad(
          res,
          `Invalid status. Allowed: ${Array.from(ALLOWED_STATUS).join(", ")}`
        );
      }
      where.status = st;
    }

    // ✅ search filter (name or number)
    if (search && String(search).trim()) {
      const s = String(search).trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { number: { contains: s, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.enquiry.count({ where }),
      prisma.enquiry.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortField]: sortOrder },
        include: {
          updatedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limitNum));

    // ✅ exact shape your frontend uses
    return ok(res, "Enquiries fetched", {
      items,
      total,
      pages,
      page: pageNum,
      limit: limitNum,
      sortBy: sortField,
      order: sortOrder,
    });
  } catch (err) {
    console.error("getEnquiries error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * ✅ GET /enquiry/:id
 */
export const getEnquiryById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return bad(res, "Invalid enquiry id");

    const enquiry = await prisma.enquiry.findUnique({
      where: { id },
      include: { updatedBy: true },
    });

    if (!enquiry) return notFound(res, "Enquiry not found");
    return ok(res, "Enquiry fetched", enquiry);
  } catch (err) {
    console.error("getEnquiryById error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const updateEnquiry = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return bad(res, "Invalid enquiry id");

    const { name, number, status } = req.body;

    const data = {};
    if (name !== undefined) {
      if (!name || typeof name !== "string") return bad(res, "name must be a non-empty string");
      data.name = name.trim();
    }
    if (number !== undefined) {
      if (!number || typeof number !== "string") return bad(res, "number must be a non-empty string");
      data.number = number.trim();
    }
    if (status !== undefined) {
      const st = String(status);
      if (!ALLOWED_STATUS.has(st)) {
        return bad(res, `Invalid status. Allowed: ${Array.from(ALLOWED_STATUS).join(", ")}`);
      }
      data.status = st;
    }

    const updatedById = pickUpdatedById(req);
    if (updatedById) data.updatedById = updatedById;

    if (Object.keys(data).length === 0) {
      return bad(res, "Nothing to update");
    }

    // ensure exists
    const exists = await prisma.enquiry.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return notFound(res, "Enquiry not found");

    const enquiry = await prisma.enquiry.update({
      where: { id },
      data,
      include: { updatedBy: true },
    });

    return ok(res, "Enquiry updated", enquiry);
  } catch (err) {
    console.error("updateEnquiry error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateEnquiryStatus = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return bad(res, "Invalid enquiry id");

    const { status } = req.body;
    if (!status) return bad(res, "status is required");

    const st = String(status);
    if (!ALLOWED_STATUS.has(st)) {
      return bad(res, `Invalid status. Allowed: ${Array.from(ALLOWED_STATUS).join(", ")}`);
    }

    const updatedById = pickUpdatedById(req);

    const exists = await prisma.enquiry.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return notFound(res, "Enquiry not found");

    const enquiry = await prisma.enquiry.update({
      where: { id },
      data: {
        status: st,
        updatedById: updatedById ?? undefined,
      },
      include: { updatedBy: true },
    });

    return ok(res, "Status updated", enquiry);
  } catch (err) {
    console.error("updateEnquiryStatus error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteEnquiry = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return bad(res, "Invalid enquiry id");

    const exists = await prisma.enquiry.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return notFound(res, "Enquiry not found");

    await prisma.enquiry.delete({ where: { id } });

    return ok(res, "Enquiry deleted");
  } catch (err) {
    console.error("deleteEnquiry error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
