// eSignature.controller.js (FULL UPDATED) ✅ departments -> DepartmentItem mapping
import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* --------------------------
  helpers
-------------------------- */
const parseIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Boolean);
  return String(value)
    .split(",")
    .map((x) => Number(x.trim()))
    .filter(Boolean);
};

/* ----------------------------------------------------
   CREATE E-SIGNATURE
   body:
     name, qualification, designation, alignment
     departments: [1,2,3] or "1,2,3"   (these are DepartmentItem IDs)
     defaultDepartmentId: "2" (optional) (DepartmentItem ID)
---------------------------------------------------- */
export const createESignature = async (req, res) => {
  try {
    const {
      name,
      qualification,
      designation,
      alignment,
      departments,
      defaultDepartmentId,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!req.file)
      return res.status(400).json({ error: "Signature image is required" });

    const signatureImg = await uploadToS3(req.file, "esignatures");

    const departmentItemIds = parseIds(departments);
    const defaultDeptItemId = defaultDepartmentId ? Number(defaultDepartmentId) : null;

    const created = await prisma.$transaction(async (tx) => {
      const sig = await tx.eSignature.create({
        data: {
          name,
          qualification,
          designation,
          alignment: alignment || "LEFT",
          signatureImg,
        },
      });

      // attach departments
      if (departmentItemIds.length) {
        await tx.eSignatureDepartment.createMany({
          data: departmentItemIds.map((deptItemId) => ({
            signatureId: sig.id,
            departmentItemId: deptItemId, // ✅ FIX
            isDefault: false,
          })),
          skipDuplicates: true,
        });
      }

      // set default
      if (defaultDeptItemId) {
        await tx.eSignatureDepartment.updateMany({
          where: { departmentItemId: defaultDeptItemId, isDefault: true },
          data: { isDefault: false },
        });

        await tx.eSignatureDepartment.upsert({
          where: {
            signatureId_departmentItemId: {
              signatureId: sig.id,
              departmentItemId: defaultDeptItemId,
            },
          },
          update: { isDefault: true },
          create: {
            signatureId: sig.id,
            departmentItemId: defaultDeptItemId,
            isDefault: true,
          },
        });
      }

      return tx.eSignature.findUnique({
        where: { id: sig.id },
        include: {
          departments: { include: { departmentItem: true } }, // ✅ FIX
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
   GET SIGNATURES BY TEST
   - test -> categoryId
   - category -> departmentItemId
---------------------------------------------------- */
export const getSignaturesByTest = async (req, res) => {
  try {
    const testId = Number(req.query.testId);
    if (!testId) {
      return res.status(400).json({ success: false, message: "testId is required" });
    }

    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: { id: true, categoryId: true,departmentItemId:true },
    });

    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    const category = await prisma.category.findUnique({
      where: { id: Number(test.categoryId) },
      select: { id: true, departmentItemId: true },
    });

    if (!category?.departmentItemId) {
      return res.json({
        success: true,
        data: {
          departmentItemId: null,
          defaults: { left: null, center: null, right: null },
          signatures: [],
        },
        message: "Category is not linked to any department",
      });
    }

    const departmentItemId = Number(category.departmentItemId);

    const deptRows = await prisma.eSignatureDepartment.findMany({
      where: { departmentItemId }, // ✅ FIX
      select: {
        isDefault: true,
        signature: {
          select: {
            id: true,
            name: true,
            designation: true,
            qualification: true,
            alignment: true,
            signatureImg: true,
          },
        },
      },
      orderBy: [{ isDefault: "desc" }, { signatureId: "asc" }],
    });

    const signatures = deptRows.map((r) => ({
      ...r.signature,
      isDefault: r.isDefault,
    }));

    const defaults = { left: null, center: null, right: null };
    for (const r of deptRows) {
      if (!r.isDefault) continue;
      const a = String(r.signature.alignment || "").toUpperCase();
      if (a === "LEFT" && !defaults.left) defaults.left = r.signature.id;
      if (a === "CENTER" && !defaults.center) defaults.center = r.signature.id;
      if (a === "RIGHT" && !defaults.right) defaults.right = r.signature.id;
    }

    return res.json({
      success: true,
      data: { departmentItemId, defaults, signatures },
    });
  } catch (err) {
    console.error("getSignaturesByTest error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* ----------------------------------------------------
   GET ALL E-SIGNATURES
---------------------------------------------------- */
export const getAllESignatures = async (req, res) => {
  try {
    const signatures = await prisma.eSignature.findMany({
      include: {
        departments: { include: { departmentItem: true } }, // ✅ FIX
      },
      orderBy: { id: "desc" },
    });
    res.json(signatures);
  } catch (error) {
    console.error("Error fetching signatures:", error);
    res.status(500).json({ error: "Failed to fetch signatures" });
  }
};

/* ----------------------------------------------------
   GET SINGLE BY ID
---------------------------------------------------- */
export const getESignatureById = async (req, res) => {
  try {
    const signature = await prisma.eSignature.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        departments: { include: { departmentItem: true } }, // ✅ FIX
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
   UPDATE
---------------------------------------------------- */
export const updateESignature = async (req, res) => {
  try {
    const sigId = Number(req.params.id);
    if (!Number.isFinite(sigId) || sigId <= 0) {
      return res.status(400).json({ error: "Invalid e-signature id" });
    }

    const {
      name,
      qualification,
      designation,
      alignment,
      departments,
      defaultDepartmentId,
    } = req.body;

    const existing = await prisma.eSignature.findUnique({
      where: { id: sigId },
      include: { departments: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "E-signature not found" });
    }

    // ---------------------------
    // Image handling
    // ---------------------------
    let imgUrl = existing.signatureImg;
    if (req.file) {
      if (existing.signatureImg) {
        await deleteFromS3(existing.signatureImg);
      }
      imgUrl = await uploadToS3(req.file, "esignatures");
    }

    // ---------------------------
    // Parse departments + default
    // ---------------------------
    const departmentItemIds =
      departments !== undefined && departments !== null
        ? parseIds(departments) // must return number[]
        : null;

    const defaultDeptItemId =
      defaultDepartmentId !== undefined &&
      defaultDepartmentId !== null &&
      String(defaultDepartmentId).trim() !== ""
        ? Number(defaultDepartmentId)
        : null;

    if (
      defaultDeptItemId !== null &&
      (!Number.isFinite(defaultDeptItemId) || defaultDeptItemId <= 0)
    ) {
      return res.status(400).json({ error: "Invalid defaultDepartmentId" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // ---------------------------
      // Update main signature
      // ---------------------------
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

      // ---------------------------
      // Sync departments list (optional)
      // ---------------------------
      if (departmentItemIds !== null) {
        // remove unselected
        await tx.eSignatureDepartment.deleteMany({
          where: {
            signatureId: sigId,
            departmentItemId: {
              notIn: departmentItemIds.length ? departmentItemIds : [-1],
            },
          },
        });

        // add missing
        if (departmentItemIds.length) {
          await tx.eSignatureDepartment.createMany({
            data: departmentItemIds.map((deptItemId) => ({
              signatureId: sigId,
              departmentItemId: Number(deptItemId),
              isDefault: false,
            })),
            skipDuplicates: true,
          });
        }
      }

      // ---------------------------
      // ✅ Fix: default department should be unique per signature
      // ---------------------------
      if (defaultDeptItemId !== null) {
        // ensure the selected default dept exists for this signature
        // (if departments were not passed, the relation might not exist yet)
        await tx.eSignatureDepartment.upsert({
          where: {
            signatureId_departmentItemId: {
              signatureId: sigId,
              departmentItemId: defaultDeptItemId,
            },
          },
          update: {},
          create: {
            signatureId: sigId,
            departmentItemId: defaultDeptItemId,
            isDefault: false,
          },
        });

        // ✅ clear any previous default for THIS signature
        await tx.eSignatureDepartment.updateMany({
          where: { signatureId: sigId, isDefault: true },
          data: { isDefault: false },
        });

        // ✅ set the new default for THIS signature
        await tx.eSignatureDepartment.update({
          where: {
            signatureId_departmentItemId: {
              signatureId: sigId,
              departmentItemId: defaultDeptItemId,
            },
          },
          data: { isDefault: true },
        });
      }

      // return updated record
      return tx.eSignature.findUnique({
        where: { id: sigId },
        include: {
          departments: {
            include: { departmentItem: true },
          },
        },
      });
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error updating e-signature:", error);
    return res.status(500).json({ error: "Failed to update e-signature" });
  }
};

/* ----------------------------------------------------
   DELETE
---------------------------------------------------- */
export const deleteESignature = async (req, res) => {
  try {
    const sigId = Number(req.params.id);

    const existing = await prisma.eSignature.findUnique({ where: { id: sigId } });
    if (!existing) return res.status(404).json({ error: "E-signature not found" });

    if (existing.signatureImg) await deleteFromS3(existing.signatureImg);

    await prisma.eSignature.delete({ where: { id: sigId } });
    res.json({ message: "E-signature deleted successfully" });
  } catch (error) {
    console.error("Error deleting e-signature:", error);
    res.status(500).json({ error: "Failed to delete e-signature" });
  }
};
