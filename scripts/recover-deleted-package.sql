-- =====================================================================================
--  RECOVERY TEMPLATE — "Independence Day Special" package deleted on 2026-08-21
--  Read every comment before running anything. Nothing in here runs by itself.
-- =====================================================================================
--
--  WHAT ACTUALLY HAPPENED (from code + migrations):
--   * DELETE /checkups/:id hard-deleted the Checkup row and its CheckupPackage rows.
--   * Order / Payment / Patient / Invoice rows were NOT deleted (no FK to Checkup).
--   * OrderMemberPackage.packageId (bill lines created in admin / app order flow)
--       -> FK is ON DELETE SET NULL  => the bill line is still there but its
--          packageId became NULL, so the bill shows "N/A"/blank, search by package
--          name finds nothing, and reports grouped by package lose the amount.
--   * OrderCheckup.checkupId (online cart bookings)
--       -> FK is ON DELETE RESTRICT per migrations (delete would have been blocked),
--          but if the live DB still has the older ON DELETE CASCADE rule the booking's
--          OrderCheckup rows were wiped and the order now shows no items.
--     -> Run scripts/diagnose-package-delete.mjs first; section A tells you which.
--
--  STEP 0 — BACKUP THE CURRENT STATE FIRST (mandatory)
--   RDS console -> Databases -> novus-health-lab-db -> Actions -> Take snapshot
--   (or: pg_dump -Fc -h <host> -U novus_admin novus_health_lab > pre-recovery-2026-08-21.dump)
--
--  STEP 1 — GET THE ORIGINAL ROWS FROM A POINT-IN-TIME RESTORE
--   RDS keeps automated backups (default 7 days). Restore to a NEW instance at a time
--   just before the delete (RDS -> Actions -> Restore to point in time), connect to it
--   and export:
--     SELECT * FROM "Checkup" WHERE name ILIKE '%independ%';                 -- the package row  (note its id = :PKG_ID)
--     SELECT * FROM "CheckupPackage" WHERE "checkupId" = :PKG_ID;           -- its test composition
--     SELECT id FROM "OrderMemberPackage" WHERE "packageId" = :PKG_ID;       -- bill lines to re-link
--     SELECT * FROM "OrderCheckup" WHERE "checkupId" = :PKG_ID;             -- online bookings (only if cascade-deleted)
--   Then delete the temporary restored instance.
--
--  STEP 2 — APPLY ON PRODUCTION, in ONE transaction, using the values from step 1.
--   Re-insert the package with the SAME id so all existing references line up.
-- =====================================================================================

BEGIN;

-- 2a. Re-create the package row (same id as before; keep it 'archived' = hidden from app,
--     but bills/bookings/reports resolve again). Fill every value from the PITR copy.
INSERT INTO "Checkup"
  (id, name, description, "imgUrl", "alsoKnowAs", "actualPrice", "offerPrice", "reportWithin", "reportUnit",
   status, "categoryId", "noOfParameter", "testType", discount, "showIn", spotlight, features, preparations,
   "sortOrder", "sampleRequired", "createdById", "createdAt", "updatedAt")
VALUES
  (:PKG_ID, 'Independence Day Special', NULL, NULL, NULL, :ACTUAL_PRICE, :OFFER_PRICE, NULL, 'hours',
   'archived', :CATEGORY_ID, NULL, 'PATHOLOGY', 0, 'TEST', false, NULL, NULL,
   0, NULL, NULL, :CREATED_AT, now());

-- keep the sequence ahead of the max id
SELECT setval(pg_get_serial_sequence('"Checkup"', 'id'), (SELECT MAX(id) FROM "Checkup"));

-- 2b. Re-create the test composition (needed for result entry / report of these orders)
INSERT INTO "CheckupPackage" ("checkupId", "testId") VALUES
  (:PKG_ID, :TEST_ID_1),
  (:PKG_ID, :TEST_ID_2);
  -- ... one row per test in the package

-- 2c. Re-link the orphaned bill lines (ids from step 1)
UPDATE "OrderMemberPackage"
   SET "packageId" = :PKG_ID
 WHERE id IN (:OMP_ID_1, :OMP_ID_2 /* , ... */)
   AND "packageId" IS NULL AND "testId" IS NULL;   -- safety: only touch orphaned rows

-- 2d. ONLY if section A of the diagnostic showed OrderCheckup = CASCADE and section F listed
--     empty online bookings: re-insert the cascade-deleted booking lines from step 1.
-- INSERT INTO "OrderCheckup" (id, "orderId", "checkupId", "createdAt") VALUES
--   (:OC_ID, :ORDER_ID, :PKG_ID, :OC_CREATED_AT);
-- SELECT setval(pg_get_serial_sequence('"OrderCheckup"', 'id'), (SELECT MAX(id) FROM "OrderCheckup"));

-- 2e. Verify before committing
SELECT count(*) AS still_orphaned FROM "OrderMemberPackage" WHERE "packageId" IS NULL AND "testId" IS NULL;
SELECT id, name, status FROM "Checkup" WHERE id = :PKG_ID;

COMMIT;   -- or ROLLBACK if the verify counts look wrong

-- =====================================================================================
--  FALLBACK if NO backup / PITR is available (heuristic — review the list manually first)
--  Orphaned lines created while the offer ran, at the package's offer price, are almost
--  certainly this package. Re-create the package (new id is fine) then:
--
--   UPDATE "OrderMemberPackage" SET "packageId" = :NEW_PKG_ID
--    WHERE "packageId" IS NULL AND "testId" IS NULL
--      AND price = :OFFER_PRICE
--      AND "createdAt" BETWEEN :PKG_CREATED_AT AND '2026-08-21 23:59:59+05:30';
--  and re-add the CheckupPackage rows from the package definition the lab has on paper.
-- =====================================================================================
