import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ParameterService = {
 create: async (testId, data) => {
  const { ranges, resultOpts, createdById, ...parameterData } = data;

  return prisma.testParameter.create({
    data: {
      ...parameterData,
      testId: Number(testId),
      createdById: createdById ?? null,

      // ⭐ HERE ranges are added
      ranges: ranges?.length
        ? {
            create: ranges.map(r => ({
              ...r,
              createdById: createdById ?? null
            }))
          }
        : undefined,

      // result options
      resultOpts: resultOpts?.length
        ? { create: resultOpts }
        : undefined
    },

    include: {
      ranges: true,
      resultOpts: true
    }
  });
}
,

// parameter.service.js - Updated update function
update: async (parameterId, data) => {
  const { ranges, resultOpts, createdById, ...parameterData } = data;

  // Start a transaction to ensure data consistency
  return await prisma.$transaction(async (tx) => {
    // First update the parameter
    const updatedParameter = await tx.testParameter.update({
      where: { id: Number(parameterId) },
      data: parameterData,
    });

    // If ranges are provided, delete existing and create new
    if (ranges !== undefined) {
      // Delete existing ranges
      await tx.parameterRange.deleteMany({
        where: { parameterId: Number(parameterId) }
      });

      // Create new ranges if provided
      if (ranges && ranges.length > 0) {
        // Filter out empty ranges
        const validRanges = ranges.filter(range => 
          range.lowerLimit !== null || 
          range.upperLimit !== null || 
          range.referenceRange
        );

        if (validRanges.length > 0) {
          await tx.parameterRange.createMany({
            data: validRanges.map(range => ({
              parameterId: Number(parameterId),
              lowerLimit: range.lowerLimit !== null ? parseFloat(range.lowerLimit) : null,
              upperLimit: range.upperLimit !== null ? parseFloat(range.upperLimit) : null,
              criticalLow: range.criticalLow !== null ? parseFloat(range.criticalLow) : null,
              criticalHigh: range.criticalHigh !== null ? parseFloat(range.criticalHigh) : null,
              referenceRange: range.referenceRange || null,
              gender: range.gender || 'Both',
              normalValueHtml: range.normalValueHtml || null,
              specialConditionHtml: range.specialConditionHtml || null,
              createdById: createdById || null
            }))
          });
        }
      }
    }

    // Return updated parameter with ranges
    return await tx.testParameter.findUnique({
      where: { id: Number(parameterId) },
      include: { 
        ranges: true,
        resultOpts: true 
      }
    });
  });
},

  delete: async (parameterId) => {
    return prisma.testParameter.delete({
      where: { id: Number(parameterId) }
    });
  },

  listByTest1: async (testId) => {
    return prisma.testParameter.findMany({
      where: { testId: Number(testId) },
      orderBy: { order: "asc" },
      include: {
        ranges: true,
        resultOpts: true
      }
    });
  },
   listByTest: async (testId, gender = "Both") => {
    try {
      const tId = Number(testId);
      const g = (gender || "Both").trim();

      // If user passes Male/Female, also include "Both" rows.
      const genderFilter = g === "Both" ? ["Both"] : [g, "Both"];

      return await prisma.testParameter.findMany({
        where: { testId: tId },
        orderBy: { order: "asc" },
        include: {
          ranges: {
            where: { gender: { in: genderFilter } },
            orderBy: { id: "asc" }, // optional
          },

          // ✅ Only keep this if `resultOpts` table has a `gender` field
          resultOpts: {
            where: { gender: { in: genderFilter } },
            orderBy: { id: "asc" }, // optional
          },
        },
      });
    } catch (err) {
      console.error("ParameterService.listByTest error:", err);
      throw err;
    }
  },
};
