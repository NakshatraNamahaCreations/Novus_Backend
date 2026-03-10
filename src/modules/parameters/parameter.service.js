import prisma from '../../lib/prisma.js';

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
                  isBold: o.isBold !== undefined ? !!o.isBold : true,
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
              isBold: o.isBold !== undefined ? !!o.isBold : true,
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

  listByTest: async (testId, gender = "Both", ageKey = "any") => {
    try {
      const tId = Number(testId);
      const g = String(gender || "Both").trim();
      const a = String(ageKey || "any").trim().toLowerCase();

      console.log(a, g)

      const isAnyAge = (val) => String(val || "").trim().toLowerCase() === "any";

      const rows = await prisma.testParameter.findMany({
        where: { testId: tId },
        orderBy: { order: "asc" },
        include: {
          ranges: { orderBy: { id: "asc" } },
          resultOpts: { orderBy: { id: "asc" } }, // ✅ always fetch all
        },
      });


      // ✅ store original counts so we don't wrongly drop parameters
      const originalCounts = new Map(
        rows.map((p) => [
          p.id,
          { ranges: p.ranges?.length || 0, resultOpts: p.resultOpts?.length || 0 },
        ])
      );

      const filtered = rows.map((p) => {
        let ranges = [...(p.ranges || [])];

        /* ---------------- GENDER FILTER (ranges only) ---------------- */
        if (ranges.length > 0) {
          if (g !== "Both") {
            const specific = ranges.filter((r) => r.gender === g);
            ranges = specific.length > 0 ? specific : ranges.filter((r) => r.gender === "Both");
          } else {
            ranges = ranges.filter((r) => r.gender === "Both");
          }
        }

        /* ---------------- AGE FILTER (ranges only) ---------------- */
        if (ranges.length > 0) {
          if (a === "any") {
            ranges = ranges.filter((r) => isAnyAge(r.referenceRange));
          } else {


            const specificAge = ranges.filter(
              (r) =>
                !isAnyAge(r.referenceRange) &&
                String(r.referenceRange || "").trim().toLowerCase() === a
            );



            const anyAge = ranges.filter((r) => isAnyAge(r.referenceRange));

            ranges = specificAge.length > 0 ? specificAge : anyAge;
          }
        }

        // ✅ resultOpts untouched, return all
        return { ...p, ranges, resultOpts: p.resultOpts || [] };
      });

      /* ✅ POST FILTER RULES
         - If parameter originally had neither ranges nor resultOpts -> keep (still valid)
         - If it originally had ranges/resultOpts, keep if at least one survived:
             ranges survived OR resultOpts exists
         - Since we never filter resultOpts, this will keep OPTIONS parameters always.
      */
      return filtered.filter((p) => {
        const orig = originalCounts.get(p.id) || { ranges: 0, resultOpts: 0 };

        // no config at all -> keep
        if (orig.ranges === 0 && orig.resultOpts === 0) return true;

        // keep if ranges survived OR has resultOpts
        if ((p.ranges?.length || 0) > 0) return true;
        if ((p.resultOpts?.length || 0) > 0) return true;

        // else drop
        return false;
      });
    } catch (err) {
      console.error("ParameterService.listByTest error:", err);
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
