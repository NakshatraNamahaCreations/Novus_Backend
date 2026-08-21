/**
 * READ-ONLY diagnostic for the "package deleted → bills/bookings disappeared" incident.
 *
 * Run from the server folder (so @prisma/client resolves):
 *   DB_URL="postgresql://user:pass@host:5432/db" node scripts/diagnose-package-delete.mjs
 * (falls back to DATABASE_URL from .env). Opens a read-only session — it cannot modify data.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.DB_URL || process.env.DATABASE_URL;
if (!url) { console.error("Set DB_URL or DATABASE_URL"); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });
const show = (label, rows) =>
  console.log(`\n## ${label}\n` + JSON.stringify(rows, (k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
const q = async (label, sql) => {
  try { show(label, await prisma.$queryRawUnsafe(sql)); }
  catch (e) { console.log(`\n## ${label} -> ERROR: ${(e.message || e).split("\n")[0]}`); }
};

try {
  await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");
  await prisma.$executeRawUnsafe("SET statement_timeout = '30s'");

  await q("Connected to", "select current_database() db, now() at time zone 'Asia/Kolkata' ist_now");

  await q("A. Actual FK ON DELETE rules for package relations (what the DB really does)", `
    select tc.table_name, tc.constraint_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.constraint_name in
      ('OrderCheckup_checkupId_fkey','OrderMemberPackage_packageId_fkey','CartItem_packageId_fkey',
       'CheckupPackage_checkupId_fkey','Banner_packageId_fkey','SpotlightBanner_packageId_fkey')
    order by 1`);

  await q("B. Is the Independence Day package still in Checkup?", `
    select id,name,status,"offerPrice","actualPrice","createdAt","updatedAt"
    from "Checkup" where name ilike '%independ%' or name ilike '%15%aug%' or name ilike '%freedom%'`);

  await q("C. Most recent Checkup ids (a gap near the top = the deleted id)", `
    select id,name,status,"createdAt" from "Checkup" order by id desc limit 10`);

  await q("D. ORPHANED BILL LINES: OrderMemberPackage rows with packageId AND testId both NULL (only a package/test delete can produce this)", `
    select count(*) cnt, min("createdAt") first_at, max("createdAt") last_at, sum(price) total_price
    from "OrderMemberPackage" where "packageId" is null and "testId" is null`);

  await q("E. Orphaned bill lines — detail (latest 100) with order / patient / payment info", `
    select omp.id as omp_id, omp.price, omp."createdAt", o.id as order_id, o."orderNumber", o.source,
           o."paymentStatus", o."paymentMode", o."finalAmount", o.status, p.name as patient, p."contactNo"
    from "OrderMemberPackage" omp
    join "OrderMember" om on om.id = omp."orderMemberId"
    join "Order" o on o.id = om."orderId"
    left join "Patient" p on p.id = om."patientId"
    where omp."packageId" is null and omp."testId" is null
    order by omp."createdAt" desc limit 100`);

  await q("F. ORDERS WITH NO LINE ITEMS AT ALL (online bookings whose OrderCheckup rows were cascade-deleted would look like this)", `
    select o.id, o."orderNumber", o.source, o."paymentStatus", o."finalAmount", o.status, o."createdAt", p.name as patient
    from "Order" o left join "Patient" p on p.id = o."patientId"
    where not exists (select 1 from "OrderCheckup" oc where oc."orderId" = o.id)
      and not exists (select 1 from "OrderMember" om join "OrderMemberPackage" omp on omp."orderMemberId" = om.id where om."orderId" = o.id)
    order by o."createdAt" desc limit 100`);

  await q("G. Orders per day since Aug 1 (orders themselves are NOT deleted by a package delete — confirm they are still here)", `
    select date("createdAt" at time zone 'Asia/Kolkata') day, source, count(*) orders, sum("finalAmount") amount
    from "Order" where "createdAt" >= '2026-08-01' group by 1,2 order by 1,2`);

  await q("H. Payments since Aug 1 (sanity: Payment has no FK to Checkup, so nothing here is touched by a package delete)", `
    select (select count(*) from "Payment" where "createdAt" >= '2026-08-01') payments,
           (select count(*) from "Order" where "createdAt" >= '2026-08-01' and "paymentStatus" ilike 'paid') paid_orders`);

  await q("I. Audit log mentions of HealthPackage (none expected for the old delete path)", `
    select id, entity, "entityId", action, "createdAt" from "AuditLog"
    where entity ilike '%package%' or entity ilike '%checkup%' order by id desc limit 20`);
} finally {
  await prisma.$disconnect();
}
