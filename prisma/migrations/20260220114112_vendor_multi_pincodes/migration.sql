/*
  Warnings:

  - Made the column `priority` on table `VendorPincode` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "radius" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "VendorPincode" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "priority" SET NOT NULL,
ALTER COLUMN "radiusKm" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Vendor_createdById_idx" ON "Vendor"("createdById");
