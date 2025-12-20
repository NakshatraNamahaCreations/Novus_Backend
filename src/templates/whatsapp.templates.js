export const WHATSAPP_TEMPLATES = {
  OTP: {
    templateId: process.env.WABRIDGE_TEMPLATE_ID,
    message: "Hello {{1}}, your OTP is {{2}}.",
    mapVariables: ({ name, otp }) => [name, otp],
  },

  ORDER_CONFIRMED: {
    templateId: process.env.WABRIDGE_ORDER_TEMPLATE_ID,
    message: "Dear {{1}}, your booking {{2}} has been successfully confirmed.",
    mapVariables: ({
      customerName,
      bookingId,
      tests,
      collectionDate,
      timeSlot,
      address,
      supportNumber,
    }) => [
      customerName,     // {{1}}
      bookingId,        // {{2}}
      tests,            // {{3}}
      collectionDate,   // {{4}}
      timeSlot,         // {{5}}
      address,          // {{6}}
      supportNumber,    // {{7}}
    ],
  },

  TEST_REPORT_READY: {
    templateId: process.env.WABRIDGE_REPORT_TEMPLATE_ID,
    message: "Hello {{1}}, your test report is ready. Reference ID: {{2}}.",
    mapVariables: ({ patientName, reportId }) => [
      patientName, // {{1}}
      reportId,    // {{2}}
    ],
  },

  PAYMENT_CONFIRMED: {
    templateId: process.env.WABRIDGE_PAYMENT_TEMPLATE_ID,
    message: `Dear *{{1}},*

We have received your payment successfully.

*Payment Details:*
• Amount Paid: ₹*{{2}}*
• Payment Mode: *{{3}}*
• Transaction ID: *{{4}}*
• Date: *{{5}}*

Thank you for trusting *Novus Health Labs.*

Wishing you good health.`,

    mapVariables: ({
      customerName,
      amount,
      paymentMode,
      transactionId,
      date,
    }) => [
      customerName,   // {{1}}
      amount,         // {{2}}
      paymentMode,    // {{3}}
      transactionId,  // {{4}}
      date,           // {{5}}
    ],
  },

  SAMPLE_COLLECTED: {
    templateId: process.env.WABRIDGE_SAMPLE_COLLECTED_TEMPLATE_ID,
    message: `Dear *{{1}},*

This is to inform you that your sample has been successfully collected by *Novus Health Labs.*

*Collection Details:*
• Collection Date: *{{2}}*
• Collected By: *{{3}}*

Your sample is now under processing. You will receive your report within the promised timeline.

Thank you for choosing *Novus Health Labs.*`,

    mapVariables: ({
      customerName,
      collectionDate,
      collectedBy,
    }) => [
      customerName,     // {{1}}
      collectionDate,   // {{2}}
      collectedBy,      // {{3}}
    ],
  },

  PAYMENT_LINK_GENERATED: {
    templateId: process.env.WABRIDGE_PAYMENT_LINK_TEMPLATE_ID,
    message: `Dear *{{1}},*

Your payment link for *Novus Health Labs* has been generated.

*Payment Details:*
• Amount Payable: ₹*{{2}}*
• Booking ID: *{{3}}*

Please complete your payment using the link below:
{{4}}

For assistance, contact us at *{{5}}*.

Thank you for choosing *Novus Health Labs.*`,

    mapVariables: ({
      customerName,
      amount,
      bookingId,
      paymentLink,
      supportNumber,
    }) => [
      customerName,   // {{1}}
      amount,         // {{2}}
      bookingId,      // {{3}}
      paymentLink,    // {{4}}
      supportNumber,  // {{5}}
    ],
  },
  FEEDBACK_LINK: {
  templateId: process.env.WABRIDGE_FEEDBACK_TEMPLATE_ID,
  message: `Dear *{{1}},*

We hope you had a smooth experience with *Novus Health Labs.*

Your feedback helps us serve you better.

Please take a moment to share your experience using the link below:
*{{2}}*

Thank you for your valuable time.

*Team Novus Health Labs*`,

  mapVariables: ({
    customerName,
    feedbackLink,
  }) => [
    customerName,   // {{1}}
    feedbackLink,   // {{2}}
  ],
},

};
