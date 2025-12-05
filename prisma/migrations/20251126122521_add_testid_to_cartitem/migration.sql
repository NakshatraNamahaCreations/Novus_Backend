/*
  Warnings:

  - You are about to drop the column `checkupId` on the `CartItem` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `CenterPackage` table. All the data in the column will be lost.
  - You are about to drop the column `packageId` on the `CenterPackage` table. All the data in the column will be lost.
  - You are about to drop the column `packageId` on the `CheckupPackage` table. All the data in the column will be lost.
  - You are about to drop the column `packageId` on the `OrderMemberPackage` table. All the data in the column will be lost.
  - You are about to drop the column `packageId` on the `Prescription` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[centerId,testId]` on the table `CenterPackage` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `testId` to the `CenterPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testId` to the `CheckupPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testId` to the `OrderMemberPackage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_checkupId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_packageId_fkey";

-- DropForeignKey
ALTER TABLE "CenterPackage" DROP CONSTRAINT "CenterPackage_packageId_fkey";

-- DropForeignKey
ALTER TABLE "CheckupPackage" DROP CONSTRAINT "CheckupPackage_packageId_fkey";

-- DropForeignKey
ALTER TABLE "OrderCheckup" DROP CONSTRAINT "OrderCheckup_checkupId_fkey";

-- DropForeignKey
ALTER TABLE "OrderMemberPackage" DROP CONSTRAINT "OrderMemberPackage_packageId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_packageId_fkey";

-- DropIndex
DROP INDEX "CenterPackage_centerId_packageId_key";

-- AlterTable
ALTER TABLE "CartItem" DROP COLUMN "checkupId",
ADD COLUMN     "testId" INTEGER;

-- AlterTable
ALTER TABLE "CenterPackage" DROP COLUMN "createdAt",
DROP COLUMN "packageId",
ADD COLUMN     "testId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CheckupPackage" DROP COLUMN "packageId",
ADD COLUMN     "testId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "OrderMemberPackage" DROP COLUMN "packageId",
ADD COLUMN     "testId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Prescription" DROP COLUMN "packageId",
ADD COLUMN     "testId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CenterPackage_centerId_testId_key" ON "CenterPackage"("centerId", "testId");

-- AddForeignKey
ALTER TABLE "CheckupPackage" ADD CONSTRAINT "CheckupPackage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterPackage" ADD CONSTRAINT "CenterPackage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCheckup" ADD CONSTRAINT "OrderCheckup_checkupId_fkey" FOREIGN KEY ("checkupId") REFERENCES "Checkup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
