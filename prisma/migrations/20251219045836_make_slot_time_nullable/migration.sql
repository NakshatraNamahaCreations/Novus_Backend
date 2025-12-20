/*
  Warnings:

  - You are about to drop the column `singletonKey` on the `ReportLayout` table. All the data in the column will be lost.
  - The `startTime` column on the `Slot` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `endTime` column on the `Slot` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "ReportLayout_singletonKey_key";

-- AlterTable
ALTER TABLE "ReportLayout" DROP COLUMN "singletonKey";

-- AlterTable
ALTER TABLE "Slot" DROP COLUMN "startTime",
ADD COLUMN     "startTime" TIMESTAMP(3),
DROP COLUMN "endTime",
ADD COLUMN     "endTime" TIMESTAMP(3);
