// services/signatureService.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const alignKey = (a) => String(a || "").toUpperCase(); // LEFT/CENTER/RIGHT

export class SignatureService {
  // ✅ Department -> { LEFT, CENTER, RIGHT }
  static async getDefaultSignaturesByDepartment(departmentIds = []) {
    const ids = [...new Set(departmentIds.map(Number))].filter(Boolean);
    if (!ids.length) return new Map();

    const rows = await prisma.eSignatureDepartment.findMany({
      where: { departmentItemId: { in: ids }, isDefault: true },
      include: {
        signature: {
          select: {
            id: true,
            name: true,
            designation: true,
            qualification: true,
            signatureImg: true,
            alignment: true,
          },
        },
      },
    });

    const map = new Map();
    for (const row of rows) {
      const depId = row.departmentItemId;
      const sig = row.signature;
      if (!sig) continue;

      if (!map.has(depId)) map.set(depId, { LEFT: null, CENTER: null, RIGHT: null });

      const bucket = map.get(depId);
      const a = alignKey(sig.alignment);

      // take first default per alignment
      if (a === "LEFT" && !bucket.LEFT) bucket.LEFT = sig;
      if (a === "CENTER" && !bucket.CENTER) bucket.CENTER = sig;
      if (a === "RIGHT" && !bucket.RIGHT) bucket.RIGHT = sig;
    }

    return map;
  }

  // ✅ Attach resolved signatures directly as leftSignature/centerSignature/rightSignature
  // Priority:
  // 1) patientTestResult override signature (already in result.leftSignature etc.)
  // 2) department defaults (by test.departmentItemId)
  static augmentResultsWithDepartmentSignatures(results, defaultByDept) {
    return (results || []).map((r) => {
      const depId = r?.test?.departmentItemId;
      const defaults = depId ? defaultByDept.get(depId) : null;

      return {
        ...r,
        leftSignature: r.leftSignature || defaults?.LEFT || null,
        centerSignature: r.centerSignature || defaults?.CENTER || null,
        rightSignature: r.rightSignature || defaults?.RIGHT || null,
      };
    });
  }
}
