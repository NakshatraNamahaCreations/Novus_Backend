import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ParameterService = {
  create: async (testId, data) => {
    const { ranges, resultOpts, createdById, ...parameterData } = data;

    return prisma.$transaction(async (tx) => {
      // 1) Create parameter
      const parameter = await tx.testParameter.create({
        data: {
          ...parameterData,
          testId: Number(testId),
          createdById: createdById ?? null,

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
        include: { ranges: true, resultOpts: true },
      });

      // 2) Auto add to report as PARAMETER item (append at end)
      const last = await tx.testReportItem.findFirst({
        where: { testId: Number(testId) },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const nextSort = (last?.sortOrder || 0) + 1;

      await tx.testReportItem.create({
        data: {
          testId: Number(testId),
          type: "PARAMETER",
          parameterId: parameter.id,
          sortOrder: nextSort,
          createdById: createdById ?? null,
        },
      });

      return parameter;
    });
  },

  // ✅ UPDATE (your same code)
  update: async (parameterId, data) => {
    const { ranges, resultOpts, createdById, ...parameterData } = data;

    return prisma.$transaction(async (tx) => {
      await tx.testParameter.update({
        where: { id: Number(parameterId) },
        data: parameterData,
      });

      if (ranges !== undefined) {
        await tx.parameterRange.deleteMany({
          where: { parameterId: Number(parameterId) },
        });

        if (Array.isArray(ranges) && ranges.length > 0) {
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

      return tx.testParameter.findUnique({
        where: { id: Number(parameterId) },
        include: { ranges: true, resultOpts: true },
      });
    });
  },

  delete: async (parameterId) => {
    // Cascade will remove related TestReportItem because parameter relation is onDelete: Cascade
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

listByTest: async (testId, gender = "Both", age = "any") => {
  const tId = Number(testId);
  const g = String(gender || "Both").trim();
  const a = String(age || "any").trim().toLowerCase();

  // ✅ Helper: is this range's referenceRange = "any" (case-insensitive)
  const isAnyAge = (val) => String(val || "").trim().toLowerCase() === "any";

  // ✅ Core filter logic per parameter
  const applyFilters = (p) => {
    let ranges = [...(p.ranges || [])];
    let resultOpts = [...(p.resultOpts || [])];

    // ---------- GENDER FILTER ----------
    if (ranges.length > 0) {
      if (g !== "Both") {
        // prefer specific gender, fallback to Both
        const specific = ranges.filter((r) => r.gender === g);
        ranges = specific.length > 0
          ? specific
          : ranges.filter((r) => r.gender === "Both");
      } else {
        ranges = ranges.filter((r) => r.gender === "Both");
      }
    }

    if (resultOpts.length > 0) {
      if (g !== "Both") {
        const specific = resultOpts.filter((o) => o.gender === g);
        resultOpts = specific.length > 0
          ? specific
          : resultOpts.filter((o) => o.gender === "Both");
      } else {
        resultOpts = resultOpts.filter((o) => o.gender === "Both");
      }
    }

    // ---------- AGE FILTER ----------
    // "any" referenceRange always matches all ages
    // specific age key only matches if age matches
    if (a !== "any" && ranges.length > 0) {
      const specificAge = ranges.filter(
        (r) => !isAnyAge(r.referenceRange) && r.referenceRange === a
      );
      const anyAge = ranges.filter((r) => isAnyAge(r.referenceRange));

      // ✅ If specific age match exists → use it, else fallback to "any"
      ranges = specificAge.length > 0 ? specificAge : anyAge;
    } else if (a === "any" && ranges.length > 0) {
      // requested any → only return "any" ranges
      ranges = ranges.filter((r) => isAnyAge(r.referenceRange));
    }

    // Same for resultOpts
    if (a !== "any" && resultOpts.length > 0) {
      const specificAge = resultOpts.filter(
        (o) => !isAnyAge(o.referenceRange) && o.referenceRange === a
      );
      const anyAge = resultOpts.filter((o) => isAnyAge(o.referenceRange));
      resultOpts = specificAge.length > 0 ? specificAge : anyAge;
    } else if (a === "any" && resultOpts.length > 0) {
      resultOpts = resultOpts.filter((o) => isAnyAge(o.referenceRange));
    }

    return { ...p, ranges, resultOpts };
  };

  // ✅ Post filter: only drop parameter if it HAD ranges/opts but NONE survived
  const applyPostFilter = (rows, originalCounts) => {
    return rows.filter((p) => {
      const orig = originalCounts.get(p.id) || { ranges: 0, resultOpts: 0 };
      // No ranges configured at all → always keep (no reference range to show, still a valid parameter)
      if (orig.ranges === 0 && orig.resultOpts === 0) return true;
      // Had ranges, some survived → keep
      if (p.ranges.length > 0 || p.resultOpts.length > 0) return true;
      // Had ranges, none survived → drop
      return false;
    });
  };

  try {
    // Fetch ALL ranges (no WHERE filter) — we filter in JS
    const rows = await prisma.testParameter.findMany({
      where: { testId: tId },
      orderBy: { order: "asc" },
      include: {
        ranges: { orderBy: { id: "asc" } },
        resultOpts: { orderBy: { id: "asc" } },
      },
    });

    // Save original counts before filtering
    const originalCounts = new Map(
      rows.map((p) => [
        p.id,
        { ranges: p.ranges.length, resultOpts: p.resultOpts.length },
      ])
    );

    const filtered = rows.map(applyFilters);
    return applyPostFilter(filtered, originalCounts);
  } catch (err) {
    console.error("listByTest error:", err);
    throw err;
  }
},
backfillReportItems: async (testId, createdById = null) => {
  const tId = Number(testId);

  return prisma.$transaction(async (tx) => {
    const params = await tx.testParameter.findMany({
      where: { testId: tId },
      select: { id: true },
      orderBy: { order: "asc" },
    });

    const max = await tx.testReportItem.aggregate({
      where: { testId: tId },
      _max: { sortOrder: true },
    });
    let sort = (max._max.sortOrder ?? 0) + 1;

    let created = 0;

    for (const p of params) {
      const exists = await tx.testReportItem.findFirst({
        where: { testId: tId, type: "PARAMETER", parameterId: p.id },
        select: { id: true },
      });

      if (!exists) {
        await tx.testReportItem.create({
          data: {
            testId: tId,
            type: "PARAMETER",
            sortOrder: sort++,
            parameterId: p.id,
            createdById: createdById ? Number(createdById) : null,
          },
        });
        created++;
      }
    }

    return { created };
  });
},

};
