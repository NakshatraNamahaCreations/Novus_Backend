/*
  Warnings:

  - You are about to drop the column `diagnosticCenterId` on the `Center` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Center" DROP CONSTRAINT "Center_diagnosticCenterId_fkey";

-- AlterTable
ALTER TABLE "Center" DROP COLUMN "diagnosticCenterId",
ADD COLUMN     "cityId" INTEGER;

-- AlterTable
ALTER TABLE "TestParameter" ADD COLUMN     "options" JSONB;

-- CreateIndex
CREATE INDEX "Center_cityId_idx" ON "Center"("cityId");

-- AddForeignKey
ALTER TABLE "Center" ADD CONSTRAINT "Center_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
