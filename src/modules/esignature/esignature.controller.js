// eSignature.controller.js (FULL UPDATED) ✅
// ✅ DepartmentItem mapping
// ✅ Multiple default departments per signature
// ✅ Deselect default works (clears removed defaults)
// ✅ Only ONE default signature per DepartmentItem (GLOBAL UNIQUE)

import prisma from '../../lib/prisma.js';
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";



/* --------------------------
  helpers
-------------------------- */
const parseIds = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Boolean);

  const str = String(value).trim();
  if (!str) return [];

  return str
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter(Boolean);
};

const uniqNums = (arr) =>
  Array.from(new Set((arr || []).map((x) => Number(x)).filter(Boolean)));

/* ----------------------------------------------------
   CREATE E-SIGNATURE
   body:
     name, qualification, designation, alignment
     departments: [1,2,3] or "1,2,3"   (DepartmentItem IDs)
     defaultDepartmentIds: [2,3] or "2,3"   (DepartmentItem IDs)
     defaultDepartmentId: "2" (legacy)
---------------------------------------------------- */
export const createESignature = async (req, res) => {
  try {
    const {
      name,
      qualification,
      designation,
      alignment,
      departments,
      defaultDepartmentIds,
      defaultDepartmentId, // legacy single
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!req.file) return res.status(400).json({ error: "Signature image is required" });

    const signatureImg = await uploadToS3(req.file, "esignatures");

    const departmentItemIds = uniqNums(parseIds(departments));

    const defaultDeptIds = uniqNums([
      ...parseIds(defaultDepartmentIds),
      ...parseIds(defaultDepartmentId),
    ]);

    const created = await prisma.$transaction(async (tx) => {
      const sig = await tx.eSignature.create({
        data: {
          name: String(name).trim(),
          qualification: qualification || null,
          designation: designation || null,
          alignment: alignment || "LEFT",
          signatureImg,
        },
      });

      // Attach departments
      if (departmentItemIds.length) {
        await tx.eSignatureDepartment.createMany({
          data: departmentItemIds.map((departmentItemId) => ({
            signatureId: sig.id,
            departmentItemId,
            isDefault: false,
          })),
          skipDuplicates: true,
        });
      }

      // ✅ Set defaults — one default per (department + alignment) slot
      if (defaultDeptIds.length) {
        // ensure rows exist for this signature
        await tx.eSignatureDepartment.createMany({
          data: defaultDeptIds.map((departmentItemId) => ({
            signatureId: sig.id,
            departmentItemId,
            isDefault: false,
          })),
          skipDuplicates: true,
        });

        // Clear previous defaults ONLY for the same department + same alignment
        // (allows Yogesh MRI LEFT and Chetan MRI RIGHT to both be defaults)
        const sigAlignment = String(alignment || "LEFT").toUpperCase();
        const conflicting = await tx.eSignatureDepartment.findMany({
          where: {
            departmentItemId: { in: defaultDeptIds },
            isDefault: true,
            signature: { alignment: sigAlignment },
          },
          select: { signatureId: true, departmentItemId: true },
        });
        if (conflicting.length) {
          for (const c of conflicting) {
            await tx.eSignatureDepartment.updateMany({
              where: { signatureId: c.signatureId, departmentItemId: c.departmentItemId, isDefault: true },
              data: { isDefault: false },
            });
          }
        }

        // set new defaults for this signature
        await tx.eSignatureDepartment.updateMany({
          where: {
            signatureId: sig.id,
            departmentItemId: { in: defaultDeptIds },
          },
          data: { isDefault: true },
        });
      }

      return tx.eSignature.findUnique({
        where: { id: sig.id },
        include: { departments: { include: { departmentItem: true } } },
      });
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating e-signature:", error);
    return res.status(500).json({ error: "Failed to create e-signature" });
  }
};

/* ----------------------------------------------------
   GET ALL E-SIGNATURES
---------------------------------------------------- */
export const getAllESignatures = async (req, res) => {
  try {
    const signatures = await prisma.eSignature.findMany({
      include: {
        departments: { include: { departmentItem: true } },
      },
      orderBy: { id: "desc" },
    });
    return res.json(signatures);
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return res.status(500).json({ error: "Failed to fetch signatures" });
  }
};

/* ----------------------------------------------------
   GET SINGLE BY ID ✅ (missing earlier)
---------------------------------------------------- */
export const getESignatureById = async (req, res) => {
  try {
    const sigId = Number(req.params.id);
    if (!Number.isFinite(sigId) || sigId <= 0) {
      return res.status(400).json({ error: "Invalid e-signature id" });
    }

    const signature = await prisma.eSignature.findUnique({
      where: { id: sigId },
      include: {
        departments: { include: { departmentItem: true } },
      },
    });

    if (!signature) return res.status(404).json({ error: "E-signature not found" });
    return res.json(signature);
  } catch (error) {
    console.error("Error fetching signature:", error);
    return res.status(500).json({ error: "Failed to fetch e-signature" });
  }
};

/* ----------------------------------------------------
   GET SIGNATURES BY TEST ✅ (missing earlier)
   - Prefer test.departmentItemId
   - Optional fallback to category.departmentItemId if exists
---------------------------------------------------- */
export const getSignaturesByTest = async (req, res) => {
  try {
    const testId = Number(req.query.testId);
    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ success: false, message: "Valid testId is required" });
    }

    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: { id: true, categoryId: true, departmentItemId: true },
    });

    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    let departmentItemId = test.departmentItemId ? Number(test.departmentItemId) : null;

    // optional fallback
    if (!departmentItemId && test.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: Number(test.categoryId) },
        select: { departmentItemId: true },
      });
      departmentItemId = category?.departmentItemId ? Number(category.departmentItemId) : null;
    }

    if (!departmentItemId) {
      return res.json({
        success: true,
        data: { departmentItemId: null, defaults: { left: null, center: null, right: null }, signatures: [] },
        message: "Test is not linked to any department",
      });
    }

    const deptRows = await prisma.eSignatureDepartment.findMany({
      where: { departmentItemId },
      select: {
        isDefault: true,
        signatureId: true,
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

    const signatures = deptRows
      .filter((r) => r.signature)
      .map((r) => ({ ...r.signature, isDefault: r.isDefault }));

    // since global unique default => only one row isDefault=true per department
    const defaults = { left: null, center: null, right: null };
    const def = deptRows.find((r) => r.isDefault && r.signature);

    if (def?.signature) {
      const a = String(def.signature.alignment || "").toUpperCase();
      if (a === "LEFT") defaults.left = def.signature.id;
      if (a === "CENTER") defaults.center = def.signature.id;
      if (a === "RIGHT") defaults.right = def.signature.id;
    }

    return res.json({ success: true, data: { departmentItemId, defaults, signatures } });
  } catch (err) {
    console.error("getSignaturesByTest error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* ----------------------------------------------------
   UPDATE E-SIGNATURE ✅ (FIXED DESELECT DEFAULT)
   body:
     departments (optional)
     defaultDepartmentIds (optional, can be "" to clear)
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
      defaultDepartmentIds,
      defaultDepartmentId, // legacy
    } = req.body;

    const existing = await prisma.eSignature.findUnique({
      where: { id: sigId },
      include: { departments: true },
    });

    if (!existing) return res.status(404).json({ error: "E-signature not found" });

    // Image handling
    let imgUrl = existing.signatureImg;
    if (req.file) {
      if (existing.signatureImg) await deleteFromS3(existing.signatureImg);
      imgUrl = await uploadToS3(req.file, "esignatures");
    }

    // Parse departments (optional)
    const departmentItemIds =
      departments !== undefined && departments !== null
        ? uniqNums(parseIds(departments))
        : null;

    // Parse defaults (optional)
    const defaultsWasSent =
      defaultDepartmentIds !== undefined || defaultDepartmentId !== undefined;

    const parsedDefaultDeptIds = defaultsWasSent
      ? uniqNums([
          ...parseIds(defaultDepartmentIds), // supports "" => []
          ...parseIds(defaultDepartmentId),
        ])
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      // Update base fields
      await tx.eSignature.update({
        where: { id: sigId },
        data: {
          name: name !== undefined ? String(name).trim() : existing.name,
          qualification: qualification !== undefined ? qualification : existing.qualification,
          designation: designation !== undefined ? designation : existing.designation,
          alignment: alignment !== undefined ? alignment : existing.alignment,
          signatureImg: imgUrl,
        },
      });

      // Sync departments (optional)
      if (departmentItemIds !== null) {
        await tx.eSignatureDepartment.deleteMany({
          where: {
            signatureId: sigId,
            departmentItemId: {
              notIn: departmentItemIds.length ? departmentItemIds : [-1],
            },
          },
        });

        if (departmentItemIds.length) {
          await tx.eSignatureDepartment.createMany({
            data: departmentItemIds.map((departmentItemId) => ({
              signatureId: sigId,
              departmentItemId,
              isDefault: false,
            })),
            skipDuplicates: true,
          });
        }

        // if a department removed, also remove its default flag (safe)
        await tx.eSignatureDepartment.updateMany({
          where: {
            signatureId: sigId,
            isDefault: true,
            departmentItemId: {
              notIn: departmentItemIds.length ? departmentItemIds : [-1],
            },
          },
          data: { isDefault: false },
        });
      }

      // ✅ Defaults handling — one default per (department + alignment) slot
      if (parsedDefaultDeptIds !== null) {
        const defaultDeptIds = parsedDefaultDeptIds;
        const sigAlignment = String(
          alignment !== undefined ? alignment : existing.alignment || "LEFT"
        ).toUpperCase();

        // 1) Clear defaults removed from THIS signature
        await tx.eSignatureDepartment.updateMany({
          where: {
            signatureId: sigId,
            isDefault: true,
            departmentItemId: {
              notIn: defaultDeptIds.length ? defaultDeptIds : [-1],
            },
          },
          data: { isDefault: false },
        });

        // 2) If empty => done (clear all defaults for this signature)
        if (defaultDeptIds.length) {
          // Ensure rows exist
          await tx.eSignatureDepartment.createMany({
            data: defaultDeptIds.map((departmentItemId) => ({
              signatureId: sigId,
              departmentItemId,
              isDefault: false,
            })),
            skipDuplicates: true,
          });

          // ✅ SLOT UNIQUE: clear the OTHER signature that holds the same dept+alignment slot
          // (Yogesh=MRI/LEFT should not clear Chetan=MRI/RIGHT)
          const conflicting = await tx.eSignatureDepartment.findMany({
            where: {
              departmentItemId: { in: defaultDeptIds },
              isDefault: true,
              signatureId: { not: sigId },
              signature: { alignment: sigAlignment },
            },
            select: { signatureId: true, departmentItemId: true },
          });
          for (const c of conflicting) {
            await tx.eSignatureDepartment.updateMany({
              where: { signatureId: c.signatureId, departmentItemId: c.departmentItemId },
              data: { isDefault: false },
            });
          }

          // Set defaults for THIS signature
          await tx.eSignatureDepartment.updateMany({
            where: {
              signatureId: sigId,
              departmentItemId: { in: defaultDeptIds },
            },
            data: { isDefault: true },
          });
        }
      }

      return tx.eSignature.findUnique({
        where: { id: sigId },
        include: { departments: { include: { departmentItem: true } } },
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
    if (!Number.isFinite(sigId) || sigId <= 0) {
      return res.status(400).json({ error: "Invalid e-signature id" });
    }

    const existing = await prisma.eSignature.findUnique({ where: { id: sigId } });
    if (!existing) return res.status(404).json({ error: "E-signature not found" });

    if (existing.signatureImg) await deleteFromS3(existing.signatureImg);

    await prisma.eSignature.delete({ where: { id: sigId } });
    return res.json({ message: "E-signature deleted successfully" });
  } catch (error) {
    console.error("Error deleting e-signature:", error);
    return res.status(500).json({ error: "Failed to delete e-signature" });
  }
};