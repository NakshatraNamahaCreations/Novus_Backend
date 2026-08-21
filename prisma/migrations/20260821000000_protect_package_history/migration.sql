-- Protect billing history (incident 2026-08-21: deleting the "Independence Day Special"
-- package set OrderMemberPackage.packageId = NULL on every bill line that used it).
--
-- A package that has been billed must never be hard-deleted. The API now archives
-- packages (Checkup.status = 'archived') instead of deleting them; this constraint
-- makes the database itself refuse a hard delete while any order line references it.
ALTER TABLE "OrderMemberPackage" DROP CONSTRAINT "OrderMemberPackage_packageId_fkey";
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
