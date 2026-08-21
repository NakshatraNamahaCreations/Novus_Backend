/**
 * Restore a hard-deleted catalogue item — a Health Package ("Checkup" table) OR an individual Test ("Package" table) —
 * together with its child rows, and re-link / re-insert the bill lines and bookings that pointed at it.
 *
 * SOURCE = a copy of the DB from BEFORE the delete (RDS point-in-time restore, or a pg_dump restored locally).
 * TARGET = production.
 *
 * Dry run (default — prints the plan, changes nothing):
 *   node scripts/restore-deleted-package.mjs --type package --source "postgresql://..pitr.." --target "postgresql://..prod.." --name "Independence"
 *   node scripts/restore-deleted-package.mjs --type test    --source ... --target ... --name "Independence"
 * Apply (after taking an RDS snapshot!):  add  --apply
 * Options: --id <n> (instead of --name), --keep-status (default re-inserts as status='archived' so it stays hidden from the app),
 *          --no-reinsert (only re-link; do NOT re-insert bill lines/bookings that were deleted outright — e.g. when staff already re-entered those orders)
 *
 * What it does (in ONE transaction on TARGET):
 *   1. INSERT the main row with its ORIGINAL id (so every existing reference lines up) + fix the id sequence
 *   2. INSERT child rows that were CASCADE/explicitly deleted (test composition, parameters, report items, centre prices …), original ids kept
 *   3. UPDATE rows whose FK was SET NULL back to the id (bill lines / prescriptions) — only rows still NULL are touched
 *   4. INSERT rows that were deleted outright (bill lines / bookings) with their original ids — only if the parent row still exists
 *   5. Print verification counts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const SOURCE = arg("--source"); const TARGET = arg("--target");
const NAME = arg("--name"); const ID = arg("--id") ? Number(arg("--id")) : null;
const TYPE = String(arg("--type", "package")).toLowerCase();
const APPLY = process.argv.includes("--apply"); const KEEP_STATUS = process.argv.includes("--keep-status");
const NO_REINSERT = process.argv.includes("--no-reinsert"); // keep manual edits: do not re-insert outright-deleted bill lines/bookings
if (!SOURCE || !TARGET || (!NAME && !ID) || !["package", "test"].includes(TYPE)) {
  console.error("Usage: --type package|test --source <url of pre-delete copy> --target <prod url> (--name <text> | --id <n>) [--apply] [--keep-status]");
  process.exit(1);
}
if (SOURCE === TARGET) { console.error("source and target must be different databases"); process.exit(1); }

/* Per-type plan.
   children = rows deleted together with the item (re-insert, original ids kept)
   relink   = rows whose FK was SET NULL (update back)
   reinsert = rows that were deleted outright; re-insert with original ids when missing in TARGET (parent must exist) */
const PLANS = {
  package: {
    label: "Health package", table: "Checkup",
    children: [{ table: "CheckupPackage", fk: "checkupId" }],
    relink: [
      { table: "OrderMemberPackage", fk: "packageId", guard: `"packageId" is null and "testId" is null` },
      { table: "SpotlightBanner", fk: "packageId", guard: `"packageId" is null and "testId" is null` },
      { table: "Banner", fk: "packageId", guard: `"packageId" is null and "testId" is null` },
    ],
    reinsert: [
      { table: "OrderMemberPackage", fk: "packageId", parent: { table: "OrderMember", col: "orderMemberId" } },
      { table: "OrderCheckup", fk: "checkupId", parent: { table: "Order", col: "orderId" } },
    ],
  },
  test: {
    label: "Test", table: "Package",
    children: [
      { table: "TestParameter", fk: "testId" }, { table: "TestReportItem", fk: "testId" }, { table: "TestOtherCategory", fk: "testId" },
      { table: "CenterPackage", fk: "testId" }, { table: "CenterCategoryCommissionTest", fk: "testId" }, { table: "CheckupPackage", fk: "testId" },
    ],
    relink: [
      { table: "OrderMemberPackage", fk: "testId", guard: `"packageId" is null and "testId" is null` },
      { table: "Prescription", fk: "testId", guard: `"testId" is null` },
    ],
    reinsert: [{ table: "OrderMemberPackage", fk: "testId", parent: { table: "OrderMember", col: "orderMemberId" } }],
  },
};
const P = PLANS[TYPE];

const src = new PrismaClient({ datasources: { db: { url: SOURCE } } });
const dst = new PrismaClient({ datasources: { db: { url: TARGET } } });
const ident = (n) => `"${n.replace(/"/g, '""')}"`;
const castFor = (udt) => (/^[a-z0-9_]+$/.test(udt) ? `::${udt}` : `::"${udt}"`);
const N = (v) => Number(v ?? 0);
const colTypes = async (db, table) => Object.fromEntries((await db.$queryRawUnsafe(`select column_name, udt_name from information_schema.columns where table_name = $1`, table)).map(c => [c.column_name, c.udt_name]));
const tableExists = async (db, table) => N((await db.$queryRawUnsafe(`select count(*) n from information_schema.tables where table_name = $1`, table))[0].n) > 0;
const hasSerialId = async (db, table) => { const r = await db.$queryRawUnsafe(`select pg_get_serial_sequence($1, 'id') s`, `"${table}"`); return !!r[0]?.s; };
const existingIds = async (db, table, ids) => ids.length ? (await db.$queryRawUnsafe(`select id from ${ident(table)} where id = any($1::int[])`, ids)).map(r => r.id) : [];
const insertRows = async (tx, table, rows, types) => {
  let n = 0;
  for (const row of rows) {
    const keys = Object.keys(row).filter(k => k in types);
    const sql = `insert into ${ident(table)} (${keys.map(ident).join(",")}) values (${keys.map((k, i) => `$${i + 1}${castFor(types[k])}`).join(",")}) on conflict do nothing`;
    n += await tx.$executeRawUnsafe(sql, ...keys.map(k => row[k]));
  }
  return n;
};

try {
  await src.$executeRawUnsafe("SET default_transaction_read_only = on");

  /* ── 1. find the item in SOURCE ── */
  const found = ID
    ? await src.$queryRawUnsafe(`select * from ${ident(P.table)} where id = $1`, ID)
    : await src.$queryRawUnsafe(`select * from ${ident(P.table)} where name ilike $1 order by id desc`, `%${NAME}%`);
  if (!found.length) { console.error(`No matching ${P.label} in SOURCE (${P.table}). Try --id, a different --name, or the other --type.`); process.exit(1); }
  if (found.length > 1) { console.error("More than one match in SOURCE — pick one with --id:"); console.table(found.map(p => ({ id: p.id, name: p.name, status: p.status, createdAt: p.createdAt }))); process.exit(1); }
  const item = found[0]; const iid = item.id;

  const children = {};
  for (const c of P.children) children[c.table] = (await tableExists(src, c.table)) ? await src.$queryRawUnsafe(`select * from ${ident(c.table)} where ${ident(c.fk)} = $1 order by 1`, iid) : [];
  const relinkIds = {};
  for (const r of P.relink) relinkIds[r.table] = (await src.$queryRawUnsafe(`select id from ${ident(r.table)} where ${ident(r.fk)} = $1 order by id`, iid)).map(x => x.id);
  const reRows = {};
  for (const r of P.reinsert) reRows[r.table] = (await tableExists(src, r.table)) ? await src.$queryRawUnsafe(`select * from ${ident(r.table)} where ${ident(r.fk)} = $1 order by id`, iid) : [];

  /* ── 2. inspect TARGET ── */
  const existing = await dst.$queryRawUnsafe(`select id, name, status from ${ident(P.table)} where id = $1`, iid);
  const nameClash = await dst.$queryRawUnsafe(`select id, name from ${ident(P.table)} where lower(trim(name)) = lower(trim($1)) and id <> $2`, item.name, iid);
  const relinkState = {};
  for (const r of P.relink) {
    const ids = relinkIds[r.table];
    relinkState[r.table] = ids.length
      ? (await dst.$queryRawUnsafe(`select count(*) filter (where ${r.guard}) as orphaned, count(*) filter (where ${ident(r.fk)} is not null) as already_linked, count(*) as found from ${ident(r.table)} where id = any($1::int[])`, ids))[0]
      : { orphaned: 0, already_linked: 0, found: 0 };
  }
  const childExisting = {};
  for (const c of P.children) childExisting[c.table] = (await tableExists(dst, c.table)) ? N((await dst.$queryRawUnsafe(`select count(*) n from ${ident(c.table)} where ${ident(c.fk)} = $1`, iid))[0].n) : 0;
  // reinsert: which source rows are missing in TARGET, and do their parents still exist?
  const reMissing = {}; const reNoParent = {};
  for (const r of P.reinsert) {
    const rows = reRows[r.table];
    const present = new Set(await existingIds(dst, r.table, rows.map(x => x.id)));
    const missing = rows.filter(x => !present.has(x.id));
    let noParent = [];
    if (missing.length && r.parent) {
      const parentIds = [...new Set(missing.map(x => x[r.parent.col]))];
      const okParents = new Set(await existingIds(dst, r.parent.table, parentIds));
      noParent = missing.filter(x => !okParents.has(x[r.parent.col]));
    }
    reMissing[r.table] = missing.filter(x => !noParent.includes(x));
    reNoParent[r.table] = noParent;
  }

  console.log("\n=== PLAN ===");
  console.log(`${P.label} (SOURCE ${P.table}): id=${iid}  name="${item.name}"  status=${item.status}  price=${item.actualPrice}/${item.offerPrice}  created=${item.createdAt?.toISOString?.() ?? item.createdAt}`);
  console.log(`  • Main row in TARGET: ${existing.length ? `EXISTS (name="${existing[0].name}") → will NOT insert` : "missing → will INSERT with same id"}`);
  if (nameClash.length) console.log(`  ! TARGET already has another ${P.label} with the same name: ids ${nameClash.map(c => c.id).join(",")} (left alone)`);
  for (const c of P.children) console.log(`  • ${c.table}: ${children[c.table].length} row(s) in SOURCE, ${childExisting[c.table]} already in TARGET → insert missing`);
  for (const r of P.relink) { const st = relinkState[r.table]; console.log(`  • ${r.table} rows that pointed at it: ${relinkIds[r.table].length} → in TARGET: ${N(st.found)} still present, ${N(st.orphaned)} orphaned (will RE-LINK), ${N(st.already_linked)} already linked (skip)`); }
  for (const r of P.reinsert) {
    const rows = reRows[r.table];
    if (NO_REINSERT) { console.log(`  • ${r.table} rows deleted outright: ${reMissing[r.table].length} of ${rows.length} missing in TARGET → SKIPPED (--no-reinsert)${reMissing[r.table].length ? ` [${reMissing[r.table].map(x => x.id).join(",")}]` : ""}`); continue; }
    console.log(`  • ${r.table} rows deleted outright: ${reMissing[r.table].length} of ${rows.length} missing in TARGET → will RE-INSERT with original ids${reMissing[r.table].length ? ` [${reMissing[r.table].map(x => x.id).join(",")}]` : ""}${reNoParent[r.table].length ? `  ! ${reNoParent[r.table].length} skipped (parent ${r.parent.table} gone: ids ${reNoParent[r.table].map(x => x.id).join(",")})` : ""}`);
  }
  console.log(`  • Re-inserted status: ${KEEP_STATUS ? item.status : "archived (hidden from app; bills/reports resolve)"}`);

  if (existing.length && String(existing[0].name).trim().toLowerCase() !== String(item.name).trim().toLowerCase()) {
    console.error(`\nABORT: TARGET ${P.table} id ${iid} is a different item ("${existing[0].name}"). Resolve manually.`);
    process.exit(1);
  }
  if (!APPLY) { console.log("\nDry run only. Re-run with --apply (AFTER taking an RDS snapshot) to perform the restore."); process.exit(0); }

  /* ── 3. apply on TARGET in one transaction ── */
  const mainTypes = await colTypes(dst, P.table);
  const childTypes = {}; for (const c of P.children) childTypes[c.table] = await colTypes(dst, c.table);
  const reTypes = {}; for (const r of P.reinsert) reTypes[r.table] = await colTypes(dst, r.table);

  const result = await dst.$transaction(async (tx) => {
    const out = { main: 0, children: {}, relinked: {}, reinserted: {} };
    if (!existing.length) {
      const row = { ...item }; if (!KEEP_STATUS && "status" in mainTypes) row.status = "archived";
      out.main = await insertRows(tx, P.table, [row], mainTypes);
      await tx.$executeRawUnsafe(`select setval(pg_get_serial_sequence('"${P.table}"','id'), (select max(id) from ${ident(P.table)}))`);
    }
    for (const c of P.children) {
      out.children[c.table] = await insertRows(tx, c.table, children[c.table], childTypes[c.table]);
      if (children[c.table].length && "id" in childTypes[c.table] && await hasSerialId(tx, c.table))
        await tx.$executeRawUnsafe(`select setval(pg_get_serial_sequence('"${c.table}"','id'), (select max(id) from ${ident(c.table)}))`);
    }
    for (const r of P.relink) {
      const ids = relinkIds[r.table];
      out.relinked[r.table] = ids.length
        ? await tx.$executeRawUnsafe(`update ${ident(r.table)} set ${ident(r.fk)} = $1 where id = any($2::int[]) and ${r.guard}`, iid, ids)
        : 0;
    }
    for (const r of P.reinsert) {
      if (NO_REINSERT) { out.reinserted[r.table] = "skipped"; continue; }
      out.reinserted[r.table] = await insertRows(tx, r.table, reMissing[r.table], reTypes[r.table]);
      if (reMissing[r.table].length && await hasSerialId(tx, r.table)) await tx.$executeRawUnsafe(`select setval(pg_get_serial_sequence('"${r.table}"','id'), (select max(id) from ${ident(r.table)}))`);
    }
    return out;
  }, { timeout: 120000 });

  console.log("\n=== APPLIED ===", JSON.stringify(result));

  /* ── 4. verify ── */
  const v1 = await dst.$queryRawUnsafe(`select id, name, status from ${ident(P.table)} where id = $1`, iid);
  console.log("Item:", v1[0]);
  for (const r of P.relink) {
    const linked = await dst.$queryRawUnsafe(`select count(*) n from ${ident(r.table)} where ${ident(r.fk)} = $1`, iid);
    const left = await dst.$queryRawUnsafe(`select count(*) n from ${ident(r.table)} where ${r.guard}`);
    console.log(`${r.table}: now linked to it = ${N(linked[0].n)} | rows still orphaned in DB (any item) = ${N(left[0].n)}`);
  }
} finally {
  await Promise.all([src.$disconnect(), dst.$disconnect()]);
}
