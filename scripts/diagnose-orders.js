import prisma from "../src/lib/prisma.js";

const orderNumbers = process.argv.slice(2);
if (!orderNumbers.length) {
  console.error("usage: node scripts/diagnose-orders.js ORD-1085 ORD-1084 ORD-1079");
  process.exit(1);
}

const orders = await prisma.order.findMany({
  where: { orderNumber: { in: orderNumbers } },
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
        paymentMethod: true,
        amount: true,
        paymentDate: true,
        createdAt: true,
        diagnosticCenterId: true,
      },
      orderBy: { createdAt: "asc" },
    },
  },
});

for (const o of orders) {
  console.log("\n=====", o.orderNumber, "=====");
  console.log("Order paymentStatus:", o.paymentStatus, "| finalAmount:", o.finalAmount, "| DC:", o.diagnosticCenterId);
  console.log("Order createdAt (UTC):", o.createdAt.toISOString());
  if (!o.payments.length) {
    console.log("  -> NO PAYMENT ROWS (this is why it doesn't show on Payments page)");
  } else {
    o.payments.forEach((p, i) => {
      console.log(`  Payment[${i}] ${p.paymentId}: ${p.paymentStatus} ${p.paymentMethod} ₹${p.amount}`);
      console.log(`     paymentDate (UTC): ${p.paymentDate?.toISOString() ?? "null"}`);
      console.log(`     createdAt   (UTC): ${p.createdAt.toISOString()}`);
      console.log(`     DC: ${p.diagnosticCenterId}`);
    });
  }
}

const missing = orderNumbers.filter((n) => !orders.find((o) => o.orderNumber === n));
if (missing.length) console.log("\nNot found in DB:", missing.join(", "));

await prisma.$disconnect();
