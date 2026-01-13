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
      customerName,
      bookingId,
      tests,
      collectionDate,
      timeSlot,
      address,
      supportNumber,
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
    }) => [customerName, amount, paymentMode, transactionId, date],
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
    mapVariables: ({ customerName, collectionDate, collectedBy }) => [
      customerName,
      collectionDate,
      collectedBy,
    ],
  },


CENTER_VISIT: {
  templateId: process.env.WABRIDGE_CENTER_VISIT_TEMPLATE_ID,
  message: `Dear {{1}},

Thank you for choosing Novus Health Labs. Please visit our center for your test as scheduled.

*Centre Details:*
• Test(s): *{{2}}*
• Centre Name: *{{3}}*
• Centre Address: *{{4}}*

Doctor prescription (if any)

Regards,
*Novus Health Labs*`,
  mapVariables: ({ customerName, tests, centerName, centerAddress }) => [
    customerName,      // {{1}}
    tests,             // {{2}}
    centerName,        // {{3}}
    centerAddress,     // {{4}}
  ],
},




  // ⭐ NEW — feedback_request_novus
  FEEDBACK_REQUEST_NOVUS: {
    templateId: process.env.WABRIDGE_FEEDBACK_REQUEST_TEMPLATE_ID,
    message: `Dear *{{1}},*

We hope you had a smooth experience with *Novus Health Labs.*

Your feedback helps us serve you better.

Please take a moment to share your experience using the link below:
*{{2}}*

Thank you for your valuable time.

*Team Novus Health Labs*`,
    mapVariables: ({ customerName, feedbackLink }) => [
      customerName,
      feedbackLink,
    ],
  },

  // ⭐ NEW — thank_you_novus
  THANK_YOU_NOVUS: {
    templateId: process.env.WABRIDGE_THANK_YOU_TEMPLATE_ID,
    message: `Dear *{{1}}*,

Thank you for choosing *Novus Health Labs* for your diagnostic needs.

We are committed to providing accurate reports, timely service, and reliable healthcare support.

We wish you good health always.

Warm regards,
*Novus Health Labs*`,
    mapVariables: ({ customerName }) => [customerName],
  },

  // ⭐ NEW — report_shared_novus
  REPORT_SHARED_NOVUS: {
    templateId: process.env.WABRIDGE_REPORT_SHARED_TEMPLATE_ID,
    message: `Dear {{1}},

Your medical test report for {{2}}, requested with Novus Health Labs, is now ready.

Report Date: {{3}}

You can view or download your report using the link below:
{{4}}

This message is sent as part of your recent test request.

Regards,
Novus Health Labs`,
    mapVariables: ({ customerName, tests, reportDate, reportLink }) => [
      customerName,
      tests,
      reportDate,
      reportLink,
    ],
  },

  // ⭐ NEW — new_patients_template
WELCOME_NEW_PATIENT: {
  templateId: process.env.WABRIDGE_NEW_PATIENT_TEMPLATE_ID,
  message: `Dear {{1}},

Welcome to Novus.

Novus helps you manage your health tests, reports, and related services in a simple and reliable way.

You can use this platform to access your diagnostic information and stay updated on your healthcare services.

Thank you for choosing Novus.`,
  mapVariables: ({ customerName }) => [customerName],
},


payment_link: {
  templateId: process.env.WABRIDGE_PAYMENT_LINK,
  message: `Dear {{1}},

Your payment link for Novus Health Labs has been generated.

Payment Details:
• Amount Payable: ₹{{2}}
• Booking ID: {{3}}

Please complete your payment using the link below:
{{4}}

For assistance, contact us at {{5}}.

Thank you for choosing Novus Health Labs.`,
  mapVariables: ({
    customerName,
    amount,
    bookingId,
    paymentLink,
    supportContact,
  }) => [
    customerName,   // {{1}}
    amount,         // {{2}}
    bookingId,      // {{3}}
    paymentLink,    // {{4}}
    supportContact, // {{5}}
  ],
}

};
