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

        ranges: ranges?.length
          ? {
              create: ranges.map((r) => ({
                ...r,
                createdById: createdById ?? null,
              })),
            }
          : undefined,

        // ✅ store Positive/Negative/Nil in ResultOption table
        resultOpts: resultOpts?.length
          ? {
              create: resultOpts
                .filter((o) => (o?.label || o?.value)?.toString().trim())
                .map((o) => ({
                  label: (o.label || o.value).toString().trim(),
                  value: (o.value || o.label).toString().trim(),
                  createdById: createdById ?? null,
                })),
            }
          : undefined,
      },
      include: {
        ranges: true,
        resultOpts: true,
      },
    });
  },
  // parameter.service.js - Updated update function
  update: async (parameterId, data) => {
    const { ranges, resultOpts, createdById, ...parameterData } = data;

    return prisma.$transaction(async (tx) => {
      // 1) Update parameter base data
      await tx.testParameter.update({
        where: { id: Number(parameterId) },
        data: parameterData,
      });

      // 2) Update ranges (delete + recreate)
      if (ranges !== undefined) {
        await tx.parameterRange.deleteMany({
          where: { parameterId: Number(parameterId) },
        });

        if (Array.isArray(ranges) && ranges.length > 0) {
          const validRanges = ranges.filter(
            (r) =>
              r.lowerLimit !== null ||
              r.upperLimit !== null ||
              r.criticalLow !== null ||
              r.criticalHigh !== null ||
              (r.referenceRange && r.referenceRange.trim())
          );

          if (validRanges.length > 0) {
            await tx.parameterRange.createMany({
              data: validRanges.map((r) => ({
                parameterId: Number(parameterId),
                lowerLimit:
                  r.lowerLimit !== null && r.lowerLimit !== ""
                    ? Number(r.lowerLimit)
                    : null,
                upperLimit:
                  r.upperLimit !== null && r.upperLimit !== ""
                    ? Number(r.upperLimit)
                    : null,
                criticalLow:
                  r.criticalLow !== null && r.criticalLow !== ""
                    ? Number(r.criticalLow)
                    : null,
                criticalHigh:
                  r.criticalHigh !== null && r.criticalHigh !== ""
                    ? Number(r.criticalHigh)
                    : null,
                referenceRange: r.referenceRange?.trim() || null,
                gender: r.gender || "Both",
                normalValueHtml: r.normalValueHtml || null,
                specialConditionHtml: r.specialConditionHtml || null,
                createdById: createdById ?? null,
              })),
            });
          }
        }
      }

      // ✅ 3) Update result options (delete + recreate)
      if (resultOpts !== undefined) {
        await tx.resultOption.deleteMany({
          where: { parameterId: Number(parameterId) },
        });

        if (Array.isArray(resultOpts) && resultOpts.length > 0) {
          const validOpts = resultOpts
            .filter((o) => (o?.label || o?.value)?.toString().trim())
            .map((o) => ({
              parameterId: Number(parameterId),
              label: (o.label || o.value).toString().trim(),
              value: (o.value || o.label).toString().trim(),
              createdById: createdById ?? null,
            }));

          if (validOpts.length > 0) {
            await tx.resultOption.createMany({ data: validOpts });
          }
        }
      }

      // 4) Return updated parameter
      return tx.testParameter.findUnique({
        where: { id: Number(parameterId) },
        include: { ranges: true, resultOpts: true },
      });
    });
  },

  delete: async (parameterId) => {
    return prisma.testParameter.delete({
      where: { id: Number(parameterId) },
    });
  },

  listByTest1: async (testId) => {
    return prisma.testParameter.findMany({
      where: { testId: Number(testId) },
      orderBy: { order: "asc" },
      include: {
        ranges: true,
        resultOpts: true,
      },
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
