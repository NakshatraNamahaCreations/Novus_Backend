import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ResultService = {
  // -------------------------------------------
  // FETCH BEST MATCHING RANGE
  // -------------------------------------------
  findRange: async (parameterId, patient) => {
    const ranges = await prisma.parameterRange.findMany({
      where: { parameterId },
      orderBy: { id: "asc" },
    });

    if (!ranges.length) return null;

    const gender = patient.gender?.toLowerCase();

    // Priority: gender match → any → first
    return (
      ranges.find((r) => r.gender?.toLowerCase() === gender) ||
      ranges.find((r) => !r.gender || r.gender === "any") ||
      ranges[0]
    );
  },
  findByOrderAndTest: (orderId, testId) =>
    prisma.patientTestResult.findFirst({
      where: {
        orderId,
        testId,
      },
      include: {
        patient: {
          select:{
            id:true,
            fullName:true
          }
        },
        test: true,
        parameterResults: true,
      },
    }),

  // -------------------------------------------
  // FLAG EVALUATION (COLOR LOGIC)
  // -------------------------------------------
  evaluateFlag: (value, range) => {
    if (value === null || value === undefined || !range) return "NA";

    if (range.criticalLow != null && value < range.criticalLow)
      return "CRITICAL_LOW";

    if (range.lowerLimit != null && value < range.lowerLimit) return "LOW";

    if (range.criticalHigh != null && value > range.criticalHigh)
      return "CRITICAL_HIGH";

    if (range.upperLimit != null && value > range.upperLimit) return "HIGH";

    return "NORMAL";
  },

  // -------------------------------------------
  // CREATE TEST RESULT (PATHOLOGY + RADIOLOGY)
  // -------------------------------------------
  createResult: async (payload) => {
    const patient = await prisma.patient.findUnique({
      where: { id: payload.patientId },
    });

    if (!patient) throw new Error("Invalid patientId");

    const isRadiology = payload.testType === "RADIOLOGY";

    // 1️⃣ Create PatientTestResult
    const created = await prisma.patientTestResult.create({
      data: {
        patientId: payload.patientId,
        testId: payload.testId,
        orderId: payload.orderId,
        collectedAt: payload.collectedAt,
        reportedAt: new Date(),
        reportedById: payload.reportedById,
        status: "reported",
        rawJson: payload,
        reportHtml: payload.reportHtml || null,
      },
    });

    // 2️⃣ If radiology, no parameters needed
    if (isRadiology) {
      await ResultService.markResultAdded(payload.orderId, payload.testId);
      return ResultService.fetchById(created.id);
    }

    // 3️⃣ PATHOLOGY PARAMETER PROCESSING
    const paramInsert = [];

    for (const p of payload.parameters) {
      const range = await ResultService.findRange(p.parameterId, patient);

      const flag =
        p.valueNumber != null
          ? ResultService.evaluateFlag(p.valueNumber, range)
          : "NA";

      paramInsert.push({
        patientTestResultId: created.id,
        parameterId: p.parameterId,
        valueNumber: p.valueNumber ?? null,
        valueText: p.valueText ?? null,
        unit: p.unit ?? null,
        flag,
        normalRangeText:
          range?.referenceRange ||
          `${range?.lowerLimit ?? "-"} - ${range?.upperLimit ?? "-"}`,
      });
    }

    if (paramInsert.length > 0) {
      await prisma.parameterResult.createMany({ data: paramInsert });
    }

    // 4️⃣ MARK ORDER MEMBER PACKAGE AS RESULT ADDED
    await ResultService.markResultAdded(payload.orderId, payload.testId);

    return ResultService.fetchById(created.id);
  },

  markResultAdded: async (orderId, testId) => {
    return prisma.orderMemberPackage.updateMany({
      where: {
        testId: testId,
        orderMember: {
          orderId: orderId,
        },
      },
      data: {
        resultAdded: true,
      },
    });
  },
  // -------------------------------------------
  // FETCH WITH children
  // -------------------------------------------
  fetchById: (id) =>
    prisma.patientTestResult.findUnique({
      where: { id: Number(id) },
      include: {
        patient: true,
        test: true,
        parameterResults: true,
      },
    }),
};
