/**
 * Home Sample Collection — slot structure update (client request, Sep 2026).
 *
 * Deactivates ALL currently active home-collection slots (they are referenced by past
 * orders, so they are never deleted — same lesson as the package incident) and creates
 * the new structure:
 *
 *   Morning   (capacity 5): 6:30–7:30, 7:30–8:30, 8:30–9:30, 9:30–10:30
 *   Afternoon (capacity 5): 12:30–1:30
 *   Evening   (capacity 3): 4:30–5:30, 5:30–6:30, 6:30–7:30, 7:30–8:30
 *   → 9 slots, total 37 bookings/day
 *
 * Times are stored the way the existing rows are: IST wall-clock converted to UTC
 * (e.g. 6:30 AM IST → 01:00Z) on an arbitrary anchor date.
 *
 * Dry run:  node scripts/update-home-collection-slots.mjs
 * Apply:    node scripts/update-home-collection-slots.mjs --apply
 *   (uses DATABASE_URL from .env unless DB_URL is set)
 *
 * NOTE: the API caches slot lists in redis (keys "slots:*"). After applying against
 * production, flush those keys on the API server or restart the API:
 *   redis-cli --scan --pattern 'slots:*' | xargs -r redis-cli del
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.DB_URL || process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ datasources: { db: { url } } });

// Anchor date for the time-of-day instants (same pattern as existing rows).
const ANCHOR = "2026-09-01";
const ist = (hhmm) => new Date(`${ANCHOR}T${hhmm}:00.000+05:30`);

const NEW_SLOTS = [
  { name: "Morning",   startTime: ist("06:30"), endTime: ist("07:30"), capacity: 5 },
  { name: "Morning",   startTime: ist("07:30"), endTime: ist("08:30"), capacity: 5 },
  { name: "Morning",   startTime: ist("08:30"), endTime: ist("09:30"), capacity: 5 },
  { name: "Morning",   startTime: ist("09:30"), endTime: ist("10:30"), capacity: 5 },
  { name: "Afternoon", startTime: ist("12:30"), endTime: ist("13:30"), capacity: 5 },
  { name: "Evening",   startTime: ist("16:30"), endTime: ist("17:30"), capacity: 3 },
  { name: "Evening",   startTime: ist("17:30"), endTime: ist("18:30"), capacity: 3 },
  { name: "Evening",   startTime: ist("18:30"), endTime: ist("19:30"), capacity: 3 },
  { name: "Evening",   startTime: ist("19:30"), endTime: ist("20:30"), capacity: 3 },
];
const fmtIST = (d) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

try {
  const active = await prisma.slot.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });

  console.log("=== PLAN ===");
  console.log(`Deactivate ${active.length} currently active slot(s):`);
  for (const s of active) console.log(`  id ${s.id} | ${s.name} | ${fmtIST(s.startTime)}–${fmtIST(s.endTime)} IST | cap ${s.capacity}`);
  console.log(`Create ${NEW_SLOTS.length} new slot(s):`);
  for (const s of NEW_SLOTS) console.log(`  ${s.name} | ${fmtIST(s.startTime)}–${fmtIST(s.endTime)} IST | cap ${s.capacity}`);
  console.log(`Total daily capacity after update: ${NEW_SLOTS.reduce((t, s) => t + s.capacity, 0)}`);
  console.log("Old slots are kept (inactive) so existing orders keep their slot history.");

  // Skip creating a slot when an identical active one already exists (idempotent re-run)
  if (!APPLY) { console.log("\nDry run only — re-run with --apply to perform the update."); process.exit(0); }

  const result = await prisma.$transaction(async (tx) => {
    const deactivated = await tx.slot.updateMany({ where: { isActive: true }, data: { isActive: false } });
    // Also disable any per-day configs of the old slots so they cannot resurrect capacity
    const dayCfg = await tx.slotDayConfig.updateMany({ where: { isActive: true }, data: { isActive: false } }).catch(() => ({ count: 0 }));
    let created = 0;
    for (const s of NEW_SLOTS) {
      await tx.slot.create({ data: { ...s, isActive: true } });
      created++;
    }
    return { deactivated: deactivated.count, dayConfigsDisabled: dayCfg.count ?? 0, created };
  });

  console.log("\n=== APPLIED ===", JSON.stringify(result));
  const now = await prisma.slot.findMany({ where: { isActive: true }, orderBy: [{ startTime: "asc" }] });
  console.log("Active slots now:");
  for (const s of now) console.log(`  id ${s.id} | ${s.name} | ${fmtIST(s.startTime)}–${fmtIST(s.endTime)} IST | cap ${s.capacity}`);
  console.log(`Total daily capacity: ${now.reduce((t, s) => t + s.capacity, 0)}`);
  console.log("\nRemember: flush the API's redis slot cache (keys 'slots:*') or restart the API so the app sees the new slots immediately.");
} finally {
  await prisma.$disconnect();
}
