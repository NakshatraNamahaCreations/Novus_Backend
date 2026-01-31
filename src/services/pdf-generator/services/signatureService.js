// services/signatureService.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class SignatureService {
  static async getDefaultSignaturesByCategory(categoryIds = []) {
    const ids = [...new Set(categoryIds.map(Number))].filter(Boolean);
    if (!ids.length) return new Map();

    const rows = await prisma.eSignatureCategory.findMany({
      where: { categoryId: { in: ids }, isDefault: true },
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
      const categoryId = row.categoryId;
      const signature = row.signature;
      
      if (!signature) continue;

      if (!map.has(categoryId)) {
        map.set(categoryId, { LEFT: null, CENTER: null, RIGHT: null });
      }

      const bucket = map.get(categoryId);
      const alignment = String(signature.alignment || "").toUpperCase();

      if (alignment === "LEFT" && !bucket.LEFT) {
        bucket.LEFT = signature;
      } else if (alignment === "CENTER" && !bucket.CENTER) {
        bucket.CENTER = signature;
      } else if (alignment === "RIGHT" && !bucket.RIGHT) {
        bucket.RIGHT = signature;
      }
    }

    return map;
  }

  static async augmentResultsWithSignatures(results, defaultByCategory) {
    return results.map(result => {
      const categoryId = result.test?.categoryId;
      const defaults = categoryId ? defaultByCategory.get(categoryId) : null;
      
      return {
        ...result,
        sigLeft: result.leftSignature || defaults?.LEFT || null,
        sigCenter: result.centerSignature || defaults?.CENTER || null,
        sigRight: result.rightSignature || defaults?.RIGHT || null,
      };
    });
  }
}