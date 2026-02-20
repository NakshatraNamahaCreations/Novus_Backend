// services/patient.service.js
import { PrismaClient } from "@prisma/client";
import { safeTrim } from "../utils/stringUtils.js";
import { SignatureService } from "./signatureService.js";

const prisma = new PrismaClient();

const normalizeGender = (g) => {
  const x = String(g || "").trim().toUpperCase();
  if (!x) return "BOTH";
  if (x === "M" || x === "MALE") return "Male";
  if (x === "F" || x === "FEMALE") return "Female";
  return "BOTH";
};

const genderWhere = (gender) => {
  const g = normalizeGender(gender);
  return { OR: [{ gender: "Both" }, { gender: "BOTH" }, { gender: g }] };
};

export class PatientService {
  static async getReportData({ orderId, patientId }) {
    try {
      const [order, patient, layout] = await Promise.all([
        this.getOrderData(orderId),
        this.getPatientData(patientId),
        this.getLayoutData(),
      ]);

    
      if (!order) throw new Error("Order not found");
      if (!patient) throw new Error("Patient not found");

      const results = await this.getPatientResults(orderId, patientId, patient.gender);

      const derived = {
        reportRefId: this.getReportRefId(order),
        patientIdentifier: this.getPatientIdentifier(patient, order),
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
  }

  static async getOrderData(orderId) {
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
  }

  static async getLayoutData() {
    return await prisma.reportLayout.findFirst({ orderBy: { id: "desc" } });
  }

  // ✅ results + reportItems + department signatures
  static async getPatientResults(orderId, patientId, patientGender) {
    const gender = normalizeGender(patientGender);

 

    // 1) Results (with test.departmentItemId)
    const results = await prisma.patientTestResult.findMany({
      where: {
        orderId: Number(orderId),
        patientId: Number(patientId),
      },
      include: {
        test: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            departmentItemId: true, // ✅ needed
            testType: true,
            departmentItem: {          // ✅ ADD THIS
      select: { id: true, name: true }
    },
          },
        },
        parameterResults: {
          include: {
            parameter: true,
          },
          orderBy: { parameterId: "asc" },
        },
        leftSignature: true,
        centerSignature: true,
        rightSignature: true,
      },
      orderBy: { id: "asc" },
    });

    if (!results.length) throw new Error("No results found for this patient");

    // 2) ReportItems by testId (gender wise)
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
            ranges: { where: genderWhere(gender), orderBy: { id: "asc" } },
            resultOpts: { orderBy: { id: "asc" } },
          },
        },
      },
    });

   
    for (const it of items) {
      if (!reportItemsByTestId.has(it.testId)) reportItemsByTestId.set(it.testId, []);
      reportItemsByTestId.get(it.testId).push(it);
    }

    // 3) Department default signatures
    const depIds = [
      ...new Set(results.map((r) => r?.test?.departmentItemId).filter(Boolean)),
    ];
    const defaultByDept = await SignatureService.getDefaultSignaturesByDepartment(depIds);

    // 4) Attach reportItems + resolve signatures
    const resultsWithReportItems = results.map((r) => ({
      ...r,
      reportItems: reportItemsByTestId.get(r.testId) || [],
    }));

    const finalResults =
      SignatureService.augmentResultsWithDepartmentSignatures(
        resultsWithReportItems,
        defaultByDept
      );

    return finalResults;
  }

  // ---- existing derived helpers (kept same) ----
  static getPatientIdentifier(patientData) {
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
    return fullName + qualification || "N/A";
  }

  static getPartnerInfo(orderData) {
    if (orderData?.center?.name) return orderData.center.name;
    if (orderData?.diagnosticCenter?.name) return orderData.diagnosticCenter.name;
    if (orderData?.refCenter?.name) return orderData.refCenter.name;
    return orderData?.source || "-";
  }

  static getOrderDates(orderData) {
    return {
      collectedAt: orderData?.date,
      receivedAt: orderData?.createdAt,
      reportedAt: orderData?.updatedAt,
    };
  }
}
