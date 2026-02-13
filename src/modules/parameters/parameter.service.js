import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ParameterService = {
   // ✅ CREATE
  create: async (testId, data) => {
    const { ranges, resultOpts, createdById, ...parameterData } = data;

    return prisma.testParameter.create({
      data: {
        ...parameterData,
        testId: Number(testId),
        createdById: createdById ?? null,

        // ✅ create ranges (no filtering here; but we still normalize numbers/nulls)
        ranges: Array.isArray(ranges) && ranges.length
          ? {
              create: ranges.map((r) => ({
                lowerLimit:
                  r?.lowerLimit !== null && r?.lowerLimit !== "" && r?.lowerLimit !== undefined
                    ? Number(r.lowerLimit)
                    : null,
                upperLimit:
                  r?.upperLimit !== null && r?.upperLimit !== "" && r?.upperLimit !== undefined
                    ? Number(r.upperLimit)
                    : null,
                criticalLow:
                  r?.criticalLow !== null && r?.criticalLow !== "" && r?.criticalLow !== undefined
                    ? Number(r.criticalLow)
                    : null,
                criticalHigh:
                  r?.criticalHigh !== null && r?.criticalHigh !== "" && r?.criticalHigh !== undefined
                    ? Number(r.criticalHigh)
                    : null,
                referenceRange: r?.referenceRange?.trim?.() || null,
                gender: r?.gender || "Both",
                normalValueHtml: r?.normalValueHtml?.trim?.() || null,
                specialConditionHtml: r?.specialConditionHtml?.trim?.() || null,
                createdById: createdById ?? null,
              })),
            }
          : undefined,

        // ✅ store Positive/Negative/Nil in ResultOption table
        resultOpts: Array.isArray(resultOpts) && resultOpts.length
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

  // ✅ UPDATE (delete + recreate ranges + resultOpts)
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
          // ✅ FIX: consider normalValueHtml/specialConditionHtml as valid content
          const validRanges = ranges.filter((r) => {
            const hasNumbers =
              (r?.lowerLimit !== null && r?.lowerLimit !== "" && r?.lowerLimit !== undefined) ||
              (r?.upperLimit !== null && r?.upperLimit !== "" && r?.upperLimit !== undefined) ||
              (r?.criticalLow !== null && r?.criticalLow !== "" && r?.criticalLow !== undefined) ||
              (r?.criticalHigh !== null && r?.criticalHigh !== "" && r?.criticalHigh !== undefined);

            const hasRef = (r?.referenceRange || "").trim().length > 0;
            const hasNormalHtml = (r?.normalValueHtml || "").trim().length > 0;
            const hasSpecialHtml = (r?.specialConditionHtml || "").trim().length > 0;

            return hasNumbers || hasRef || hasNormalHtml || hasSpecialHtml;
          });

          if (validRanges.length > 0) {
            await tx.parameterRange.createMany({
              data: validRanges.map((r) => ({
                parameterId: Number(parameterId),

                lowerLimit:
                  r?.lowerLimit !== null && r?.lowerLimit !== "" && r?.lowerLimit !== undefined
                    ? Number(r.lowerLimit)
                    : null,

                upperLimit:
                  r?.upperLimit !== null && r?.upperLimit !== "" && r?.upperLimit !== undefined
                    ? Number(r.upperLimit)
                    : null,

                criticalLow:
                  r?.criticalLow !== null && r?.criticalLow !== "" && r?.criticalLow !== undefined
                    ? Number(r.criticalLow)
                    : null,

                criticalHigh:
                  r?.criticalHigh !== null && r?.criticalHigh !== "" && r?.criticalHigh !== undefined
                    ? Number(r.criticalHigh)
                    : null,

                referenceRange: r?.referenceRange?.trim?.() || null,
                gender: r?.gender || "Both",
                normalValueHtml: r?.normalValueHtml?.trim?.() || null,
                specialConditionHtml: r?.specialConditionHtml?.trim?.() || null,

                createdById: createdById ?? null,
              })),
            });
          }
        }
      }

      // 3) Update result options (delete + recreate)
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
  const tId = Number(testId);
  const g = String(gender || "Both").trim();

  // If user passes Male/Female/Kids, also include "Both" rows.
  const genderFilter = g === "Both" ? ["Both"] : [g, "Both"];

  const includeWithGender = {
    ranges: {
      where: { gender: { in: genderFilter } },
      orderBy: { id: "asc" },
    },
    resultOpts: {
      where: { gender: { in: genderFilter } },
      orderBy: { id: "asc" },
    },
  };

  const includeNoGender = {
    ranges: { orderBy: { id: "asc" } },
    resultOpts: { orderBy: { id: "asc" } },
  };

  try {
    return await prisma.testParameter.findMany({
      where: { testId: tId },
      orderBy: { order: "asc" },
      include: includeWithGender,
    });
  } catch (err) {
    // ✅ Prisma schema/client on server likely doesn't know `gender`
    const msg = String(err?.message || "");
    const isGenderSchemaProblem =
      msg.includes("Unknown argument `gender`") ||
      msg.includes("Unknown field") ||
      msg.includes("Available options are marked with ?");

    if (!isGenderSchemaProblem) throw err;

    // Fallback: fetch without gender filtering
    const rows = await prisma.testParameter.findMany({
      where: { testId: tId },
      orderBy: { order: "asc" },
      include: includeNoGender,
    });

    // Filter in JS only if the returned items actually have a gender field
    if (g !== "Both") {
      for (const p of rows) {
        if (Array.isArray(p.ranges) && p.ranges.some(r => "gender" in r)) {
          const hasSpecific = p.ranges.some(r => r.gender === g);
          p.ranges = hasSpecific
            ? p.ranges.filter(r => r.gender === g)
            : p.ranges.filter(r => r.gender === "Both");
        }

        if (Array.isArray(p.resultOpts) && p.resultOpts.some(o => "gender" in o)) {
          const hasSpecific = p.resultOpts.some(o => o.gender === g);
          p.resultOpts = hasSpecific
            ? p.resultOpts.filter(o => o.gender === g)
            : p.resultOpts.filter(o => o.gender === "Both");
        }
      }
    }

    return rows;
  }
}

};
