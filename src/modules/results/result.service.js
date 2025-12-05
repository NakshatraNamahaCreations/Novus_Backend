import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ResultService = {
  findRange: async (parameterId, patient) => {
    const ranges = await prisma.parameterRange.findMany({
      where: { parameterId },
      orderBy: { id: "asc" }
    });

    if (ranges.length === 0) return null;

    const gender = patient.gender?.toLowerCase();

    return (
      ranges.find((r) => r.gender?.toLowerCase() === gender) ||
      ranges.find((r) => !r.gender || r.gender === "any") ||
      ranges[0]
    );
  },

  evaluateFlag: (value, range) => {
    if (!value || !range) return "NA";

    if (range.criticalLow && value < range.criticalLow) return "CRITICAL_LOW";
    if (range.criticalHigh && value > range.criticalHigh) return "CRITICAL_HIGH";
    if (range.lowerLimit && value < range.lowerLimit) return "LOW";
    if (range.upperLimit && value > range.upperLimit) return "HIGH";

    return "NORMAL";
  },

  createResult: async (payload) => {
    const patient = await prisma.patient.findUnique({
      where: { id: payload.patientId }
    });

    const created = await prisma.patientTestResult.create({
      data: {
        patientId: payload.patientId,
        testId: payload.testId,
        orderId: payload.orderId,
        collectedAt: payload.collectedAt,
        reportedAt: new Date(),
        reportedById: payload.reportedById,
        status: "reported",
        rawJson: payload
      }
    });

    for (const p of payload.parameters) {
      const range = await ResultService.findRange(p.parameterId, patient);

      const flag =
        p.valueNumber != null
          ? ResultService.evaluateFlag(p.valueNumber, range)
          : "NA";

      await prisma.parameterResult.create({
        data: {
          patientTestResultId: created.id,
          parameterId: p.parameterId,
          valueNumber: p.valueNumber,
          valueText: p.valueText,
          unit: p.unit,
          flag,
          normalRangeText: range?.referenceRange || null
        }
      });
    }

    return prisma.patientTestResult.findUnique({
      where: { id: created.id },
      include: {
        patient: true,
        test: true,
        parameterResults: true
      }
    });
  },

  fetchById: (id) =>
    prisma.patientTestResult.findUnique({
      where: { id: Number(id) },
      include: {
        patient: true,
        test: true,
        parameterResults: true
      }
    })
};
