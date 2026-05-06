// Diagnostic: list every Order created today (IST) with its Payment rows.
// Helps explain why some orders don't appear on the Payments page.
//
// Run from server folder:  node scripts/diagnose-today.js

import prisma from "../src/lib/prisma.js";

// Today in IST -> UTC range
const now = new Date();
const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
const y = ist.getUTCFullYear();
const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
const d = String(ist.getUTCDate()).padStart(2, "0");
const startUTC = new Date(`${y}-${m}-${d}T00:00:00.000+05:30`);
const endUTC = new Date(`${y}-${m}-${d}T23:59:59.999+05:30`);

console.log(`Today IST: ${y}-${m}-${d}`);
console.log(`UTC range: ${startUTC.toISOString()}  ->  ${endUTC.toISOString()}\n`);

const orders = await prisma.order.findMany({
  where: { createdAt: { gte: startUTC, lte: endUTC } },
  orderBy: { id: "asc" },
  select: {
    id: true,
    orderNumber: true,
    paymentStatus: true,
    finalAmount: true,
    diagnosticCenterId: true,
    createdAt: true,
    payments: {
      select: {
        id: true,
        paymentId: true,
        paymentStatus: true,
        amount: true,
        paymentDate: true,
        createdAt: true,
        diagnosticCenterId: true,
      },
      orderBy: { createdAt: "asc" },
    },
  },
});

console.log(`Found ${orders.length} order(s) created today.\n`);

let withPayment = 0;
let withoutPayment = 0;

for (const o of orders) {
  const tag = o.payments.length ? "💰 HAS PAYMENT" : "⏳ NO PAYMENT  ";
  console.log(
    `${tag} | ${o.orderNumber.padEnd(20)} | id=${String(o.id).padEnd(5)} | finalAmt=₹${String(
      o.finalAmount
    ).padEnd(7)} | orderStatus=${o.paymentStatus} | DC=${o.diagnosticCenterId}`
  );
  if (o.payments.length) {
    withPayment++;
    o.payments.forEach((p) =>
      console.log(
        `       └─ Payment#${p.id} ${p.paymentStatus} ₹${p.amount} createdAt=${p.createdAt.toISOString()} DC=${p.diagnosticCenterId}`
      )
    );
  } else {
    withoutPayment++;
  }
}

console.log(`\nSummary: ${withPayment} with payment, ${withoutPayment} without payment.`);
console.log(
  `Payments page (default) shows only orders with at least one Payment row. The ${withoutPayment} "NO PAYMENT" orders won't appear there until a payment is recorded.`
);

await prisma.$disconnect();
