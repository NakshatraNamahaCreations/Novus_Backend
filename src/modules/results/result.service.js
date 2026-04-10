import prisma from '../../lib/prisma.js';
import { ageToKeyFromDob } from "../../utils/ageToKeyFromDob.js";


const normalizeGender = (g) => {
  const x = String(g || "").trim().toUpperCase();
  if (!x) return "BOTH";
  if (x === "M" || x === "MALE") return "MALE";
  if (x === "F" || x === "FEMALE") return "FEMALE";
  return "BOTH";
};

const genderWhere = (gender) => {
  const g = normalizeGender(gender);
  return { OR: [{ gender: "Both" }, { gender: "BOTH" }, { gender: g }] };
};

const toIntOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};




// apply gender + age filter on ranges
const filterRangesByGenderAndAge = (ranges = [], gender, ageKey) => {
  try {
    const original = [...(ranges || [])];
    if (original.length === 0) return [];

    const normGender = String(gender || "Both").trim();
    const normAge = String(ageKey || "any").trim().toLowerCase();

    const isAnyAge = (v) => String(v || "").trim().toLowerCase() === "any";
    const normRef = (v) => String(v || "").trim().toLowerCase();

    // 1) gender filter
    let out = [...original];

    if (normGender !== "Both") {
      const specificGender = out.filter((r) => String(r.gender || "").trim() === normGender);
      out = specificGender.length ? specificGender : out.filter((r) => String(r.gender || "").trim() === "Both");
    } else {
      out = out.filter((r) => String(r.gender || "").trim() === "Both");
    }

    // if gender filtering killed all, fallback to original (optional safety)
    if (out.length === 0) out = [...original];

    // 2) age filter
    if (normAge === "any") {
      const anyAge = out.filter((r) => isAnyAge(r.referenceRange));
      out = anyAge.length ? anyAge : out; // if no anyAge, keep whatever exists
    } else {
      const specificAge = out.filter((r) => !isAnyAge(r.referenceRange) && normRef(r.referenceRange) === normAge);
      const anyAge = out.filter((r) => isAnyAge(r.referenceRange));
      out = specificAge.length ? specificAge : (anyAge.length ? anyAge : out);
    }

    return out;
  } catch (err) {
    console.error("filterRangesByGenderAndAge error:", err);
    return ranges || [];
  }
};

export const ResultService = {
  // -------------------------------------------
  // DEFAULT SIGNATURES (DEPARTMENT-WISE ✅)
  // -------------------------------------------
  getDefaultSignaturesByDepartment: async (departmentItemId) => {
    try {
      if (!departmentItemId) return { left: null, center: null, right: null };

      const rows = await prisma.eSignatureDepartment.findMany({
        where: { departmentItemId: Number(departmentItemId), isDefault: true },
        select: { signature: { select: { id: true, alignment: true } } },
      });

      const defaults = { left: null, center: null, right: null };
      for (const r of rows) {
        const a = String(r.signature?.alignment || "").toUpperCase();
        if (a === "LEFT") defaults.left = r.signature.id;
        if (a === "CENTER") defaults.center = r.signature.id;
        if (a === "RIGHT") defaults.right = r.signature.id;
      }
      return defaults;
    } catch (err) {
      console.error("getDefaultSignaturesByDepartment error:", err);
      return { left: null, center: null, right: null };
    }
  },

  // (Optional fallback if you still want category-wise defaults)
  // getDefaultSignaturesByCategory: async (categoryId) => { ... },

  // -------------------------------------------
  // FETCH BEST MATCHING RANGE
  // -------------------------------------------
findRange: async (parameterId, patient) => {
  try {
    const ranges = await prisma.parameterRange.findMany({
      where: { parameterId: Number(parameterId) },
      orderBy: { id: "asc" },
    });

    if (!ranges.length) return null;

    const patientGender = normalizeGender(patient?.gender); // "MALE" | "FEMALE" | "BOTH"
    const ageKey = ageToKeyFromDob(patient?.dob); // ✅ DOB -> ageKey

    const norm = (v) => String(v || "").trim().toLowerCase();
    const normG = (v) => normalizeGender(v); // compare both sides the same way

    const match = (r, gWanted, ageWanted) => {
      const rg = normG(r.gender || "Both"); // normalize DB value too
      const ra = norm(r.referenceRange); // age key stored here
      const gOk = rg === gWanted;
      const aOk = ra === norm(ageWanted);
      return gOk && aOk;
    };

    // ✅ Priority order:
    // 1) exact gender + exact ageKey
    let found = ranges.find((r) => match(r, patientGender, ageKey));
    if (found) return found;

    // 2) Both + exact ageKey
    found = ranges.find((r) => match(r, "BOTH", ageKey));
    if (found) return found;

    // 3) exact gender + any
    found = ranges.find((r) => match(r, patientGender, "any"));
    if (found) return found;

    // 4) Both + any
    found = ranges.find((r) => match(r, "BOTH", "any"));
    if (found) return found;

    // 5) if patient ageKey is any, still try gender only
    found =
      ranges.find((r) => normG(r.gender) === patientGender) ||
      ranges.find((r) => normG(r.gender) === "BOTH");

    return found || ranges[0];
  } catch (err) {
    console.error("findRange error:", err);
    return null;
  }
},

  // -------------------------------------------
  // FLAG EVALUATION
  // -------------------------------------------
  evaluateFlag: (value, range) => {

    console.log("value, range",value, range)
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
    try {
      const patient = await prisma.patient.findUnique({
        where: { id: Number(payload.patientId) },
      });
      if (!patient) throw new Error("Invalid patientId");

      const isRadiology = payload.testType === "RADIOLOGY";

      // ✅ Get test department for department-wise default signature
      const test = await prisma.test.findUnique({
        where: { id: Number(payload.testId) },
        select: { id: true, departmentItemId: true, categoryId: true },
      });
      if (!test) throw new Error("Invalid testId");

      // ✅ Department-wise defaults
      let defaults = await ResultService.getDefaultSignaturesByDepartment(
        test.departmentItemId
      );

      // ✅ Optional fallback to category defaults (only if you keep that feature)
      // if (isEmptyDefaults(defaults)) {
      //   defaults = await ResultService.getDefaultSignaturesByCategory(test.categoryId);
      // }

      // ✅ Choose signature ids: manual override > department defaults
      const leftSignatureId =
        payload.leftSignatureId != null
          ? toIntOrNull(payload.leftSignatureId)
          : defaults.left;

      const centerSignatureId =
        payload.centerSignatureId != null
          ? toIntOrNull(payload.centerSignatureId)
          : defaults.center;

      const rightSignatureId =
        payload.rightSignatureId != null
          ? toIntOrNull(payload.rightSignatureId)
          : defaults.right;

      // ✅ Create PatientTestResult WITH signatures
      const created = await prisma.patientTestResult.create({
        data: {
          patientId: Number(payload.patientId),
          testId: Number(payload.testId),
          orderId: payload.orderId != null ? Number(payload.orderId) : null,
          collectedAt: payload.collectedAt || null,
          reportedAt: new Date(),
          reportedById:
            payload.reportedById != null ? Number(payload.reportedById) : null,
          createdById:
            payload.createdById != null ? Number(payload.createdById) : null,
          status: payload.approve ? "APPROVED" : "REPORTED",
          notes: payload.notes || null,
          reportHtml: payload.reportHtml || null,
          rawJson: payload.rawJson || null,

          leftSignatureId: leftSignatureId || null,
          centerSignatureId: centerSignatureId || null,
          rightSignatureId: rightSignatureId || null,
        },
      });

      // ✅ Radiology => no parameters
      if (isRadiology) return ResultService.fetchById(created.id);

      // ✅ Pathology parameters
      const paramInsert = [];
      const params = Array.isArray(payload.parameters) ? payload.parameters : [];

      for (const p of params) {
        const range = await ResultService.findRange(p.parameterId, patient);

        const flag =
          p.valueNumber != null
            ? ResultService.evaluateFlag(p.valueNumber, range)
            : "NA";

        const hasLower =
          range?.lowerLimit !== null && range?.lowerLimit !== undefined;
        const hasUpper =
          range?.upperLimit !== null && range?.upperLimit !== undefined;

        const limitsText =
          hasLower || hasUpper
            ? `${hasLower ? range.lowerLimit : "-"} - ${
                hasUpper ? range.upperLimit : "-"
              }`.trim()
            : "";

        paramInsert.push({
          patientTestResultId: created.id,
          parameterId: Number(p.parameterId),
          valueNumber: p.valueNumber ?? null,
          valueText: p.valueText ?? null,
          unit: p.unit ?? null,
          flag,
          normalRangeText: limitsText || (range?.normalValueHtml ?? null),
          createdById:
            payload.createdById != null ? Number(payload.createdById) : null,
        });
      }

      if (paramInsert.length) {
        await prisma.parameterResult.createMany({ data: paramInsert });
      }

      return ResultService.fetchById(created.id);
    } catch (err) {
      console.error("createResult error:", err);
      throw err;
    }
  },

  // -------------------------------------------
  // UPDATE RESULT (DEPARTMENT DEFAULTS ✅)
  // -------------------------------------------
  update: async (id, payload) => {
    try {
      const existing = await prisma.patientTestResult.findUnique({
        where: { id: Number(id) },
        select: {
          id: true,
          testId: true,
          patientId: true,
          leftSignatureId: true,
          centerSignatureId: true,
          rightSignatureId: true,
        },
      });
      if (!existing) throw new Error("Result not found");

      const patient = await prisma.patient.findUnique({
        where: { id: existing.patientId },
      });
      if (!patient) throw new Error("Invalid patientId");

      const test = await prisma.test.findUnique({
        where: { id: existing.testId },
        select: { departmentItemId: true, categoryId: true },
      });
      if (!test) throw new Error("Test not found for result");

      // ✅ Department-wise defaults
      let defaults = await ResultService.getDefaultSignaturesByDepartment(
        test.departmentItemId
      );

      // ✅ Optional fallback to category defaults
      // if (isEmptyDefaults(defaults)) {
      //   defaults = await ResultService.getDefaultSignaturesByCategory(test.categoryId);
      // }

      const hasLeft = Object.prototype.hasOwnProperty.call(
        payload,
        "leftSignatureId"
      );
      const hasCenter = Object.prototype.hasOwnProperty.call(
        payload,
        "centerSignatureId"
      );
      const hasRight = Object.prototype.hasOwnProperty.call(
        payload,
        "rightSignatureId"
      );

      const nextLeft = hasLeft
        ? toIntOrNull(payload.leftSignatureId)
        : existing.leftSignatureId ?? defaults.left;

      const nextCenter = hasCenter
        ? toIntOrNull(payload.centerSignatureId)
        : existing.centerSignatureId ?? defaults.center;

      const nextRight = hasRight
        ? toIntOrNull(payload.rightSignatureId)
        : existing.rightSignatureId ?? defaults.right;

      await prisma.patientTestResult.update({
        where: { id: Number(id) },
        data: {
          status: payload.approve ? "APPROVED" : "REPORTED",
          reportedById: toIntOrNull(payload.reportedById),
          createdById: toIntOrNull(payload.createdById),
          reportedAt: new Date(),
          notes: payload.notes ?? null,

          leftSignatureId: nextLeft || null,
          centerSignatureId: nextCenter || null,
          rightSignatureId: nextRight || null,

          ...(payload.testType === "RADIOLOGY" && {
            reportHtml: payload.reportHtml ?? null,
            rawJson: payload.rawJson ?? null,
          }),
        },
      });

      // ✅ PATHOLOGY PARAMETERS (rebuild with normalRangeText + flag)
      if (payload.testType === "PATHOLOGY" && Array.isArray(payload.parameters)) {
        await prisma.parameterResult.deleteMany({
          where: { patientTestResultId: Number(id) },
        });

        const rows = [];

        for (const p of payload.parameters) {
          const range = await ResultService.findRange(p.parameterId, patient);

          const flag =
            p.valueNumber != null
              ? ResultService.evaluateFlag(p.valueNumber, range)
              : "NA";

          const hasLower =
            range?.lowerLimit !== null && range?.lowerLimit !== undefined;
          const hasUpper =
            range?.upperLimit !== null && range?.upperLimit !== undefined;

          const limitText =
            hasLower || hasUpper
              ? `${hasLower ? range.lowerLimit : ""} - ${
                  hasUpper ? range.upperLimit : ""
                }`.trim()
              : "";

          const normalRangeText =
            limitText || (range?.normalValueHtml ?? null);

          rows.push({
            patientTestResultId: Number(id),
            parameterId: Number(p.parameterId),
            valueNumber: p.valueNumber ?? null,
            valueText: p.valueText ?? null,
            unit: p.unit ?? null,
            flag,
            normalRangeText,
            createdById: toIntOrNull(payload.createdById),
          });
        }

        if (rows.length) await prisma.parameterResult.createMany({ data: rows });
      }

      return prisma.patientTestResult.findUnique({
        where: { id: Number(id) },
        include: {
          parameterResults: true,
          leftSignature: true,
          centerSignature: true,
          rightSignature: true,
        },
      });
    } catch (err) {
      console.error("Update error:", err);
      throw err;
    }
  },

  // -------------------------------------------
  // FETCH / FIND
  // -------------------------------------------
  fetchById: (id) =>
    prisma.patientTestResult.findUnique({
      where: { id: Number(id) },
      include: {
        patient: true,
        test: true,
        parameterResults: {
          include: {
            parameter: {
              select: { id: true, name: true },
            },
          },
        },
        leftSignature: true,
        centerSignature: true,
        rightSignature: true,
      },
    }),

  findByOrderTestAndPatient: (orderId, testId, patientId) =>
    prisma.patientTestResult.findFirst({
      where: { orderId, testId, patientId },
      include: {
        patient: { select: { id: true, fullName: true } },
        test: { select: { id: true, name: true, testType: true } },
        parameterResults: {
          include: { parameter: { select: { id: true, name: true, type: true } } },
        },
        leftSignature: true,
        centerSignature: true,
        rightSignature: true,
      },
    }),

  // -------------------------------------------
  // PDF / REPORT HELPERS (unchanged from yours)
  // -------------------------------------------
  getDefaultLayout: () =>
    prisma.reportLayout.findFirst({ orderBy: { id: "desc" } }),

getOrderReportsAllPatients: async ({ orderId, testId }) => {
  const oId = Number(orderId);
  const tId =
    testId != null && String(testId).trim() !== "" ? Number(testId) : null;

  if (!Number.isFinite(oId)) throw new Error("Invalid orderId");
  if (tId != null && !Number.isFinite(tId)) throw new Error("Invalid testId");

  // 1) Order + members
  const order = await prisma.order.findUnique({
    where: { id: oId },
    select: {
      id: true,
      orderNumber: true,
      merchantOrderId: true,
      date: true,
      status: true,
      totalAmount: true,
      finalAmount: true,
      patientId: true,
      doctor: { select: { id: true, name: true, initial: true, qualification: true } },
      center: { select: { id: true, name: true, address: true } },
      diagnosticCenter: { select: { id: true, name: true, address: true } },
      vendor: { select: { id: true, name: true } },
      orderMembers: { select: { patientId: true } },
    },
  });

  if (!order) throw new Error("Order not found");

  const patientIds = Array.from(
    new Set(
      [order.patientId, ...(order.orderMembers || []).map((m) => m.patientId)]
        .filter(Boolean)
    )
  );

  if (!patientIds.length) throw new Error("No patients linked to this order");

  // 2) Fetch patients (✅ age removed, only dob)
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: {
      id: true,
      fullName: true,
      initial: true,
      dob: true,
      gender: true,
      contactNo: true,
      email: true,
    },
    orderBy: { id: "asc" },
  });

  const patientById = new Map(patients.map((p) => [p.id, p]));

  // 3) Fetch ALL results for this order + patients
  const results = await prisma.patientTestResult.findMany({
    where: {
      orderId: oId,
      patientId: { in: patientIds },
      ...(tId ? { testId: tId } : {}),
    },
    include: {
      test: {
        select: {
          id: true,
          name: true,
          testType: true,
          categoryId: true,
          subCategoryId: true,
          departmentItemId: true,
        },
      },
      parameterResults: {
        orderBy: { parameterId: "asc" },
        include: {
          parameter: {
            include: {
              // bring all, filter later
              ranges: { orderBy: { id: "asc" } },
              resultOpts: { orderBy: { id: "asc" } },
            },
          },
        },
      },
      leftSignature: true,
      centerSignature: true,
      rightSignature: true,
    },
    orderBy: [{ patientId: "asc" }, { id: "asc" }],
  });

  if (!results?.length) throw new Error("No test results found for this order");

  // 4) Layout (shared)
  const layout = await prisma.reportLayout.findFirst({
    orderBy: { id: "desc" },
  });

  // 5) Group results by patient
  const resultsByPatientId = new Map();
  for (const r of results) {
    if (!resultsByPatientId.has(r.patientId)) resultsByPatientId.set(r.patientId, []);
    resultsByPatientId.get(r.patientId).push(r);
  }

  // 6) Build patientReports (reportItems depend on gender + age)
  const patientReports = await Promise.all(
    patientIds.map(async (pid) => {
      try {
        const patient = patientById.get(pid);
        if (!patient) return null;

        const gender = normalizeGender(patient.gender);
        const ageKey = ageToKeyFromDob(patient.dob); // ✅ DOB -> ageKey

        const patientResults = resultsByPatientId.get(pid) || [];
        const testIds = [...new Set(patientResults.map((r) => r.testId))];

        const reportItemsByTestId = {};

        await Promise.all(
          testIds.map(async (tid) => {
            const items = await prisma.testReportItem.findMany({
              where: { testId: tid, ...genderWhere(gender) },
              orderBy: { sortOrder: "asc" },
              include: {
                parameter: {
                  include: {
                    // fetch all ranges; filter in JS for both gender+age
                    ranges: { orderBy: { id: "asc" } },
                    resultOpts: { orderBy: { id: "asc" } },
                  },
                },
              },
            });

            // ✅ apply gender+age filter to each item's parameter.ranges
            for (const it of items) {
              if (it?.parameter?.ranges?.length) {
                it.parameter.ranges = filterRangesByGenderAndAge(
                  it.parameter.ranges,
                  gender,
                  ageKey
                );
              }
            }

            reportItemsByTestId[tid] = items;
          })
        );

        // ✅ Also filter ranges inside results.parameterResults.parameter.ranges
        // (because you included parameter ranges in patientTestResult too)
        for (const r of patientResults) {
          if (Array.isArray(r.parameterResults)) {
            for (const pr of r.parameterResults) {
              if (pr?.parameter?.ranges?.length) {
                pr.parameter.ranges = filterRangesByGenderAndAge(
                  pr.parameter.ranges,
                  gender,
                  ageKey
                );
              }
            }
          }
        }

        return {
          patient,
          gender,
          ageKey,
          results: patientResults,
          reportItemsByTestId,
        };
      } catch (err) {
        console.error("patientReports build error:", err);
        return null;
      }
    })
  );

  return {
    order,
    layout,
    patientReports: patientReports.filter(Boolean),
  };
},

  getReportDataByTest: async ({ testId, patientTestResultId, gender }) => {
    const tId = Number(testId);
    const ptrId = patientTestResultId ? Number(patientTestResultId) : null;
    const g = normalizeGender(gender);

    if (!tId) throw new Error("testId is required");

    const test = await prisma.test.findUnique({
      where: { id: tId },
      select: {
        id: true,
        name: true,
        testType: true,
        gender: true,
        categoryId: true,
        parameters: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            testId: true,
            name: true,
            type: true,
            order: true,
            unit: true,
            method: true,
            notes: true,
            isActive: true,
            options: true,
            resultOpts: { orderBy: { id: "asc" }, select: { id: true, label: true, value: true } },
            ranges: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                gender: true,
                lowerLimit: true,
                upperLimit: true,
                criticalLow: true,
                criticalHigh: true,
                referenceRange: true,
                normalValueHtml: true,
                specialConditionHtml: true,
              },
            },
          },
        },
      },
    });

    if (!test) throw new Error("Test not found");

    const reportItems = await prisma.testReportItem.findMany({
      where: { testId: tId, ...(g ? genderWhere(g) : {}) },
      orderBy: { sortOrder: "asc" },
      include: {
        parameter: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const patientTestResult = ptrId
      ? await prisma.patientTestResult.findUnique({
          where: { id: ptrId },
          include: {
            test: { select: { id: true, name: true } },
            parameterResults: {
              orderBy: { parameterId: "asc" },
              include: {
                parameter: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    method: true,
                    ranges: true,
                    resultOpts: true,
                    options: true,
                  },
                },
              },
            },
            leftSignature: true,
            centerSignature: true,
            rightSignature: true,
          },
        })
      : null;

    const filteredParameters = (test.parameters || []).map((p) => {
      const ranges = Array.isArray(p.ranges) ? p.ranges : [];
      const rangesFiltered =
        g === "BOTH"
          ? ranges
          : ranges.filter((r) => {
              const rg = normalizeGender(r.gender);
              return rg === "BOTH" || rg === g;
            });

      return { ...p, ranges: rangesFiltered };
    });

    return {
      test: { ...test, parameters: filteredParameters },
      reportItems,
      patientTestResult,
      gender: g,
    };
  },
};
