// services/patientService.js
import { PrismaClient } from "@prisma/client";
import { safeTrim } from "../utils/stringUtils.js";

const prisma = new PrismaClient();

export class PatientService {
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
      }
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
          }
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
          }
        },
        center: {
          select: {
            id: true,
            name: true,
            address: true,
          }
        },
        vendor: {
          select: {
            id: true,
            name: true,
          }
        },
        orderMembers: {
          include: {
            patient: true,
            orderMemberPackages: {
              include: {
                package: true,
                test: true,
              }
            }
          }
        }
      }
    });
  }

  static async getPatientResults(orderId, patientId) {
    const results = await prisma.patientTestResult.findMany({
      where: { 
        orderId: Number(orderId), 
        patientId: Number(patientId) 
      },
      include: {
        test: { 
          select: { 
            id: true, 
            name: true, 
            categoryId: true 
          } 
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

    if (!results.length) {
      throw new Error("No results found for this patient");
    }

    return results;
  }

  static async getLayoutData() {
    return await prisma.reportLayout.findFirst({
      orderBy: { id: "desc" }
    });
  }

  /**
   * Get patient identifier from patient data
   */
  static getPatientIdentifier(patientData, orderData = null) {
    if (!patientData) return "—";

   
    
    const identifiers = [
      patientData.initial,
      patientData.contactNo,
      patientData.aadharNo,
      patientData.passportNo,
      `PID-${patientData.id}`,
    ];
    
    const identifier = identifiers.find(id => id && safeTrim(id) !== "");
    return identifier ? safeTrim(identifier) : `PID-${patientData.id}`;
  }

  /**
   * Get report reference ID from order
   */
  static getReportRefId(orderData) {
    return orderData?.orderNumber || 
           orderData?.merchantOrderId || 
           `ORD-${orderData?.id}` || 
           "—";
  }

  /**
   * Get reference doctor information from order
   */
  static getRefDoctorInfo(orderData) {
    if (!orderData?.doctor) return "N/A";
    
    const doctor = orderData.doctor;
    const title = doctor.initial ? `${doctor.initial} ` : '';
    const name = doctor.name || '';
    const fullName = safeTrim(`${title}${name}`);
    const qualification = doctor.qualification ? ` (${doctor.qualification})` : '';
    
    return fullName + qualification || "N/A";
  }

  /**
   * Get partner information from order
   */
  static getPartnerInfo(orderData) {
    if (orderData?.center?.name) {
      return orderData.center.name;
    }
    
    if (orderData?.diagnosticCenter?.name) {
      return orderData.diagnosticCenter.name;
    }
    
    if (orderData?.refCenter?.name) {
      return orderData.refCenter.name;
    }
    
    return orderData?.source || "-";
  }

  /**
   * Get order dates for the patient strip
   */
  static getOrderDates(orderData) {
    return {
      collectedAt: orderData?.date,
      receivedAt: orderData?.createdAt,
      reportedAt: orderData?.updatedAt,
    };
  }

  /**
   * Get reference range text from parameter result data
   * Based on your schema structure
   */
  static getReferenceRangeText(parameterResult) {
    // Check parameter result first
    if (parameterResult.normalRangeText && safeTrim(parameterResult.normalRangeText)) {
      return safeTrim(parameterResult.normalRangeText);
    }
    
    // Check parameter ranges
    const ranges = parameterResult.parameter?.ranges || [];
    if (ranges.length > 0) {
      // Try to get reference range from ranges
      const range = ranges[0];
      if (range.referenceRange && safeTrim(range.referenceRange)) {
        return safeTrim(range.referenceRange);
      }
      
      // Build range from lower/upper limits
      if (range.lowerLimit !== null || range.upperLimit !== null) {
        const lower = range.lowerLimit !== null ? String(range.lowerLimit) : '';
        const upper = range.upperLimit !== null ? String(range.upperLimit) : '';
        if (lower || upper) {
          return `${lower}${lower && upper ? ' - ' : ''}${upper}`.trim();
        }
      }
    }
    
    // Check parameter directly
    const parameter = parameterResult.parameter;
    if (parameter) {
      if (parameter.lowerLimit !== null || parameter.upperLimit !== null) {
        const lower = parameter.lowerLimit !== null ? String(parameter.lowerLimit) : '';
        const upper = parameter.upperLimit !== null ? String(parameter.upperLimit) : '';
        if (lower || upper) {
          return `${lower}${lower && upper ? ' - ' : ''}${upper}`.trim();
        }
      }
    }
    
    return "";
  }
}