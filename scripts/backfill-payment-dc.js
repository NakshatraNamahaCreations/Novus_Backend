// Backfill: copy Order.diagnosticCenterId onto Payment.diagnosticCenterId
// for any Payment row where it's null but the parent Order has one.
//
// Run:
//   node scripts/backfill-payment-dc.js          (dry-run, prints what would change)
//   node scripts/backfill-payment-dc.js --apply  (actually update)

import prisma from "../src/lib/prisma.js";

const APPLY = process.argv.includes("--apply");

const candidates = await prisma.payment.findMany({
  where: {
    diagnosticCenterId: null,
    order: { diagnosticCenterId: { not: null } },
  },
  select: {
    id: true,
    paymentId: true,
    orderId: true,
    paymentDate: true,
    order: { select: { orderNumber: true, diagnosticCenterId: true } },
  },
  orderBy: { id: "asc" },
});

console.log(`Found ${candidates.length} Payment rows missing diagnosticCenterId.`);
candidates.forEach((p) =>
  console.log(
    `  Payment#${p.id} ${p.paymentId} | order ${p.order.orderNumber} -> DC ${p.order.diagnosticCenterId}`
  )
);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to update.");
  await prisma.$disconnect();
  process.exit(0);
}

let updated = 0;
for (const p of candidates) {
  await prisma.payment.update({
    where: { id: p.id },
    data: { diagnosticCenterId: p.order.diagnosticCenterId },
  });
  updated++;
}
console.log(`\n✅ Updated ${updated} Payment row(s).`);

await prisma.$disconnect();
