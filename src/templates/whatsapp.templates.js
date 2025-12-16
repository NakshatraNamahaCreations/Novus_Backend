export const WHATSAPP_TEMPLATES = {
  OTP: {
    templateId: process.env.WABRIDGE_TEMPLATE_ID,
    message: "Hello {{1}}, your OTP is {{2}}",
    mapVariables: ({ name, otp }) => [name, otp],
  },

  ORDER_CONFIRMED: {
    templateId: process.env.WABRIDGE_ORDER_TEMPLATE_ID,
    message: "Hi {{1}}, your order {{2}} is confirmed.",
    mapVariables: ({ customerName, orderId }) => [
      customerName,
      orderId,
    ],
  },

  TEST_REPORT_READY: {
    templateId: process.env.WABRIDGE_REPORT_TEMPLATE_ID,
    message: "Hello {{1}}, your test report is ready. Ref: {{2}}",
    mapVariables: ({ patientName, reportId }) => [
      patientName,
      reportId,
    ],
  },
};
