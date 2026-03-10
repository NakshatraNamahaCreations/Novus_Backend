export const WHATSAPP_TEMPLATES = {
  OTP: {
    templateId: process.env.WABRIDGE_TEMPLATE_ID,
    message: "Hello {{1}}, your OTP is {{2}}.",
    mapVariables: ({ name, otp }) => [name, otp],
  },

ORDER_CONFIRMED: {
  templateId: process.env.WABRIDGE_ORDER_TEMPLATE_ID,
  message: `Dear {{1}}

Your booking with Novus Health Labs has been successfully confirmed.

Booking Details:
• Booking ID: {{2}}
• Test(s): {{3}}
• Sample Collection Date: {{4}}
• Time Slot: {{5}}
• Address: {{6}}

Our trained phlebotomist will visit your location as scheduled.

For assistance, contact us at {{7}}

Regards,
Novus Health Labs`,
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

  CENTER_CONFIRMATION: {
    templateId: process.env.WABRIDGE_CENTER_CONFIRMATION,
    message:
      "Dear {{1}},\n\n" +
      "A patient appointment has been scheduled at your facility.\n\n" +
      "Patient Name: {{2}}\n" +
      "Test: {{3}}\n" +
      "Date & Time: {{4}}\n\n" +
      "Please confirm the slot availability.\n\n" +
      "Regards,\n" +
      "Novus Health Labs",
    mapVariables: ({ centerName, patientName, tests, dateTime }) => [
      centerName,
      patientName,
      tests,
      dateTime,
    ],
  },

  PAYMENT_CONFIRMED: {
    templateId: process.env.WABRIDGE_PAYMENT_TEMPLATE_ID,
    message:
      "Dear {{1}},\n\n" +
      "Thank you for choosing Novus Health Labs.\n" +
      "We confirm that your payment has been successfully received.\n\n" +
      "🧾 Download your invoice:\n" +
      "{{2}}\n\n" +
      "📱 Access your reports, invoices, and health records anytime through our mobile app:\n" +
      "Android App: https://play.google.com/store/apps/details?id=com.novus.novushealthlab\n" +
      "iOS: Launching Soon\n\n" +
      "Regards,\n" +
      "Novus Health Labs",
    mapVariables: ({ customerName, invoiceUrl }) => [customerName, invoiceUrl],
  },

  SAMPLE_COLLECTED: {
    templateId: process.env.WABRIDGE_SAMPLE_COLLECTED_TEMPLATE_ID,
    message: `Dear {{1}},

Your sample has been successfully collected by Novus Health Labs.

🧪 Collection Date & Time: {{2}}

Your sample is currently under processing. The report will be shared within the promised timeline.

Thank you for choosing Novus Health Labs.

Regards,
Novus Health Labs`,
    mapVariables: ({ customerName, collectionDateTime }) => [
      customerName,
      collectionDateTime,
    ],
  },

  SAMPLE_COLLECTION_EXECUTIVE_ON_THE_WAY: {
    templateId:
      process.env.WABRIDGE_SAMPLE_COLLECTION_EXECUTIVE_ON_THE_WAY_TEMPLATE_ID,
    message: `Dear {{1}},

Your sample collection executive from Novus Health Labs is on the way to your location.

Please keep your ID proof and doctor prescription ready (if available).

Thank you for choosing Novus Health Labs.

Regards,
Novus Health Labs`,
    mapVariables: ({ customerName }) => [customerName],
  },

  HOME_SAMPLE_BOOKED_ADMIN: {
    templateId: process.env.WABRIDGE_HOME_SAMPLE_BOOKED_ADMIN_TEMPLATE_ID,
    message: `Dear {{1}},

A new home sample collection has been booked.

Patient Name: {{2}}
Tests: {{3}}
Date: {{4}}
Slot: {{5}}

Please arrange accordingly.

Regards,
Novus Health Labs`,
    mapVariables: ({ adminName, patientName, tests, date, slot }) => [
      adminName,
      patientName,
      tests,
      date,
      slot,
    ],
  },

  CENTER_VISIT: {
    templateId: process.env.WABRIDGE_CENTER_VISIT_TEMPLATE_ID,
    message: `Dear {{1}},

Thank you for choosing Novus Health Labs. Please visit our center for your test as scheduled.

Centre Details:
• Test(s): {{2}}
• Centre Name: {{3}}
• Centre Address: {{4}}

Doctor prescription (if any)

Regards,
Novus Health Labs`,
    mapVariables: ({ customerName, tests, centerName, centerAddress }) => [
      customerName,
      tests,
      centerName,
      centerAddress,
    ],
  },

  FEEDBACK_REQUEST_NOVUS: {
    templateId: process.env.WABRIDGE_FEEDBACK_REQUEST_TEMPLATE_ID,
    message: `Dear {{1}},

We hope you had a smooth experience with Novus Health Labs.

Your feedback helps us serve you better.

Please take a moment to share your experience using the link below:
{{2}}

Thank you for your valuable time.

Team Novus Health Labs`,
    mapVariables: ({ customerName, feedbackLink }) => [
      customerName,
      feedbackLink,
    ],
  },

  THANK_YOU_NOVUS: {
    templateId: process.env.WABRIDGE_THANK_YOU_TEMPLATE_ID,
    message: `Dear {{1}},

Thank you for choosing Novus Health Labs for your diagnostic needs.

We are committed to providing accurate reports, timely service, and reliable healthcare support.

We wish you good health always.

Warm regards,
Novus Health Labs`,
    mapVariables: ({ customerName }) => [customerName],
  },

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
  mapVariables: ({
    customerName,
    tests,
    reportDate,
    reportLink,
  }) => [customerName, tests, reportDate, reportLink],
},
//   REPORT_SHARED_NOVUS: {
//     templateId: process.env.WABRIDGE_REPORT_SHARED_TEMPLATE_ID,
//     message: `Dear {{1}},

// Your {{2}} test report requested through Novus Health Labs is now ready.

// 📄 Report Date: {{3}}
// 🏥 Processing Centre: {{5}}

// You can view or download your report using the secure link below:
// {{4}}

// 📱 Access all your reports and health records anytime with the Novus Health App:
// Android: https://play.google.com/store/apps/details?id=com.novus.novushealthlab
// iOS: Launching Soon

// Thank you for choosing Novus Health Labs.

// Regards,
// Novus Health Labs`,
//     mapVariables: ({
//       customerName,
//       tests,
//       reportDate,
//       reportLink,
//       processingCentre,
//     }) => [customerName, tests, reportDate, reportLink, processingCentre],
//   },

WELCOME_NEW_PATIENT: {
  templateId: process.env.WABRIDGE_NEW_PATIENT_TEMPLATE_ID,
  message: `Welcome to Novus Health Labs

Dear Name,

Your health records and reports can now be managed easily in one place.

📲 Download the Novus Health App
View reports • Store health records • Track tests anytime

Android: https://play.google.com/store/apps/details?id=com.novus.novus_health_lab

🍎 iOS: Launching Soon

— Team Novus Health Labs`,
  mapVariables: () => [],
},

  PAYMENT_LINK: {
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
    }) => [customerName, amount, bookingId, paymentLink, supportContact],
  },

  DOCTOR_REPORT_CONFIRMATION: {
    templateId: process.env.WABRIDGE_DOCTOR_REPORT_CONFIRMATION_TEMPLATE_ID,
    message: `Dear Dr. {{1}},

Greetings from Novus Health Labs.

The diagnostic report for your referred patient is now ready.

Patient Name: {{2}}
Age/Gender: {{3}}
Tests Done: {{4}}

You can download/view the report using the link below:
📄 Report Link: {{5}}

Thank you for your valuable referral and continued trust in us.

Warm regards,
Novus Health Labs`,
    mapVariables: ({
      doctorName,
      patientName,
      ageGender,
      testsDone,
      reportLink,
    }) => [doctorName, patientName, ageGender, testsDone, reportLink],
  },
};