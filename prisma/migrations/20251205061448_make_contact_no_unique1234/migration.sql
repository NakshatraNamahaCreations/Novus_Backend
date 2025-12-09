/*
  Warnings:

  - Added the required column `balanceAfter` to the `EarningsHistory` table without a default value. This is not possible if the table is not empty.
  - Made the column `type` on table `EarningsHistory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "EarningsHistory" DROP CONSTRAINT "EarningsHistory_vendorId_fkey";

-- AlterTable
ALTER TABLE "EarningsHistory" ADD COLUMN     "balanceAfter" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "EarningsHistory_vendorId_idx" ON "EarningsHistory"("vendorId");

-- CreateIndex
CREATE INDEX "EarningsHistory_createdAt_idx" ON "EarningsHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "EarningsHistory" ADD CONSTRAINT "EarningsHistory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
