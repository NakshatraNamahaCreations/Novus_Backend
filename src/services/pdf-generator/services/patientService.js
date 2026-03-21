
import { safeTrim } from "../utils/stringUtils.js";
import { SignatureService } from "./signatureService.js";
import { ageToKeyFromDob } from "../../../utils/ageToKeyFromDob.js";

import prisma from '../../../lib/prisma.js';


const normalizeGender = (g) => {
  const x = String(g || "").trim().toUpperCase();
  if (!x) return "Both";
  if (x === "M" || x === "MALE") return "Male";
  if (x === "F" || x === "FEMALE") return "Female";
  if (x === "K" || x === "KID" || x === "KIDS") return "Kids";
  return "Both";
};

const genderWhere = (gender) => {
  const g = normalizeGender(gender);

  if (g === "Kids") {
    return {
      OR: [
        { gender: "Kids" },
        { gender: "KIDS" },
        { gender: "Both" },
        { gender: "BOTH" },
      ],
    };
  }

  return {
    OR: [{ gender: "Both" }, { gender: "BOTH" }, { gender: g }],
  };
};

// ✅ ONLY gender filter for ranges (NO age logic anymore)
const rangesWhereByGenderOnly = (gender) => {
  return genderWhere(gender);
};

export class PatientService {
  static async getReportData({ orderId, patientId, testResultId }) {
    try {
      const [order, patient, layout] = await Promise.all([
        this.getOrderData(orderId),
        this.getPatientData(patientId),
        this.getLayoutData(),
      ]);

      if (!order) throw new Error("Order not found");
      if (!patient) throw new Error("Patient not found");

      // ✅ age removed from signature
      const results = await this.getPatientResults(
        orderId,
        patientId,
        patient.gender,
        patient.dob,
        testResultId
      );

      const derived = {
        reportRefId: this.getReportRefId(order),
        patientIdentifier: this.getPatientIdentifier(patient),
        refDoctorInfo: this.getRefDoctorInfo(order),
        partnerInfo: this.getPartnerInfo(order),
        orderDates: this.getOrderDates(order),
      };

      return { order, patient, layout, results, derived };
    } catch (err) {
      console.error("PatientService.getReportData error:", err);
      throw err;
    }
  }

  static async getPatientData(patientId) {
    try {
      return await prisma.patient.findUnique({
        where: { id: Number(patientId) },
        select: {
          id: true,
          fullName: true,
          initial: true,
          dob: true,
          age: true,
          gender: true,
          contactNo: true,
          email: true,
          height: true,
          weight: true,
          smokingHabit: true,
          alcoholConsumption: true,
          exerciseFrequency: true,
          bloodType: true,
          aadharNo: true,
          address: true,
          passportNo: true,
          relationship: true,
          isPrimary: true,
          primaryId: true,
        },
      });
    } catch (err) {
      console.error("PatientService.getPatientData error:", err);
      throw err;
    }
  }

  static async getOrderData(orderId) {
    try {
      return await prisma.order.findUnique({
        where: { id: Number(orderId) },
        include: {
          doctor: {
            select: {
              id: true,
              name: true,
              initial: true,
              qualification: true,
              speciality: true,
              mobile: true,
              email: true,
            },
          },
          patient: {
            select: {
              id: true,
              fullName: true,
              initial: true,
              dob: true,
              age: true,
              gender: true,
              contactNo: true,
            },
          },
          center: { select: { id: true, name: true, address: true } },
          vendor: { select: { id: true, name: true } },
          orderMembers: {
            include: {
              patient: true,
              orderMemberPackages: { include: { package: true, test: true } },
            },
          },
        },
      });
    } catch (err) {
      console.error("PatientService.getOrderData error:", err);
      throw err;
    }
  }

  static async getLayoutData() {
    try {
      return await prisma.reportLayout.findFirst({ orderBy: { id: "desc" } });
    } catch (err) {
      console.error("PatientService.getLayoutData error:", err);
      throw err;
    }
  }

  // ✅ Age-wise filter removed
 static async getPatientResults(orderId, patientId, patientGender, patientDob, testResultId) {
  try {
    const gender = normalizeGender(patientGender);
    const ageKey = ageToKeyFromDob(patientDob);

  

    // 1) Results
    const whereClause = {
      orderId: Number(orderId),
      patientId: Number(patientId),
    };
    if (testResultId) {
      whereClause.id = Number(testResultId);
    }

    const results = await prisma.patientTestResult.findMany({
      where: whereClause,
      include: {
        test: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            departmentItemId: true,
            testType: true,
            departmentItem: { select: { id: true, name: true } },
          },
        },
        parameterResults: {
          include: { parameter: true },
          orderBy: { parameterId: "asc" },
        },
        leftSignature: true,
        centerSignature: true,
        rightSignature: true,
      },
      orderBy: { id: "asc" },
    });

    if (!results.length)
      throw new Error("No results found for this patient");

    const testIds = [...new Set(results.map((r) => r.testId))];
    const reportItemsByTestId = new Map();

    const items = await prisma.testReportItem.findMany({
      where: {
        testId: { in: testIds },
        ...genderWhere(gender),
      },
      orderBy: [{ testId: "asc" }, { sortOrder: "asc" }],
      include: {
        parameter: {
          include: {
            ranges: {
              orderBy: { id: "asc" }, // fetch all first
            },
            resultOpts: {
              orderBy: { id: "asc" },
            },
          },
        },
      },
    });


    /* ---------------- APPLY GENDER + AGE FILTER ON RANGES ---------------- */
    const isAnyAge = (val) =>
      String(val || "").trim().toLowerCase() === "any";

    for (const it of items) {
      if (it.parameter?.ranges?.length) {
        let ranges = [...it.parameter.ranges];

        // 🔹 Gender filter
        const genderFiltered =
          gender !== "Both"
            ? ranges.filter((r) => r.gender === gender)
            : ranges.filter((r) => r.gender === "Both");

        ranges =
          genderFiltered.length > 0
            ? genderFiltered
            : ranges.filter((r) => r.gender === "Both");

        // 🔹 Age filter
        if (ageKey === "any") {
          ranges = ranges.filter((r) => isAnyAge(r.referenceRange));
        } else {

        
          const specific = ranges.filter(
            (r) =>
              !isAnyAge(r.referenceRange) &&
              String(r.referenceRange || "")
                .trim()
                .toLowerCase() === ageKey
          );

          const anyAge = ranges.filter((r) =>
            isAnyAge(r.referenceRange)
          );

          ranges = specific.length > 0 ? specific : anyAge;
        }

        it.parameter.ranges = ranges;
      }

      if (!reportItemsByTestId.has(it.testId))
        reportItemsByTestId.set(it.testId, []);

      reportItemsByTestId.get(it.testId).push(it);
    }

    // Department signatures
    const depIds = [
      ...new Set(results.map((r) => r?.test?.departmentItemId).filter(Boolean)),
    ];

    const defaultByDept =
      await SignatureService.getDefaultSignaturesByDepartment(depIds);

    const resultsWithReportItems = results.map((r) => ({
      ...r,
      reportItems: reportItemsByTestId.get(r.testId) || [],
    }));

    return SignatureService.augmentResultsWithDepartmentSignatures(
      resultsWithReportItems,
      defaultByDept
    );
  } catch (err) {
    console.error("PatientService.getPatientResults error:", err);
    throw err;
  }
}

  // ---- derived helpers ----
  static getPatientIdentifier(patientData) {
    try {
      if (!patientData) return "—";
      const identifiers = [
        patientData.initial,
        patientData.contactNo,
        patientData.aadharNo,
        patientData.passportNo,
        `PID-${patientData.id}`,
      ];
      const identifier = identifiers.find((id) => id && safeTrim(id) !== "");
      return identifier ? safeTrim(identifier) : `PID-${patientData.id}`;
    } catch {
      return patientData?.id ? `PID-${patientData.id}` : "—";
    }
  }

  static getReportRefId(orderData) {
    return (
      orderData?.orderNumber ||
      orderData?.merchantOrderId ||
      `ORD-${orderData?.id}` ||
      "—"
    );
  }

  static getRefDoctorInfo(orderData) {
    if (!orderData?.doctor) return "N/A";
    const d = orderData.doctor;
    const title = d.initial ? `${d.initial} ` : "";
    const name = d.name || "";
    const fullName = safeTrim(`${title}${name}`);
    const qualification = d.qualification ? ` (${d.qualification})` : "";
    return (fullName + qualification) || "N/A";
  }

static getPartnerInfo(orderData) {
  if (orderData?.center?.name) return orderData.center.name;
  if (orderData?.diagnosticCenter?.name) return orderData.diagnosticCenter.name;
  if (orderData?.refCenter?.name) return orderData.refCenter.name;
  return "-";   // ← just return dash, don't expose source
}

  static getOrderDates(orderData) {
    return {
      collectedAt: orderData?.date,
      receivedAt: orderData?.createdAt,
      reportedAt: orderData?.updatedAt,
    };
  }
}