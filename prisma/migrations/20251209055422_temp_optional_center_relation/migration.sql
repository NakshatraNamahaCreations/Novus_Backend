/*
  Warnings:

  - You are about to drop the column `account` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `billType` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `emailReportConfig` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `paymentType` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `sendBillToPatient` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `sendReportToPatient` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `venue` on the `Center` table. All the data in the column will be lost.
  - You are about to drop the column `altEmail` on the `ReferenceCenter` table. All the data in the column will be lost.
  - You are about to drop the column `shortCode` on the `ReferenceCenter` table. All the data in the column will be lost.
  - You are about to drop the column `venueId` on the `ReferenceCenter` table. All the data in the column will be lost.
  - You are about to drop the `Venue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ReferenceCenter" DROP CONSTRAINT "ReferenceCenter_venueId_fkey";

-- DropForeignKey
ALTER TABLE "Venue" DROP CONSTRAINT "Venue_createdById_fkey";

-- AlterTable
ALTER TABLE "Center" DROP COLUMN "account",
DROP COLUMN "billType",
DROP COLUMN "city",
DROP COLUMN "emailReportConfig",
DROP COLUMN "paymentType",
DROP COLUMN "sendBillToPatient",
DROP COLUMN "sendReportToPatient",
DROP COLUMN "venue",
ADD COLUMN     "diagnosticCenterId" INTEGER,
ADD COLUMN     "pincode" TEXT,
ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refCenterId" INTEGER;

-- AlterTable
ALTER TABLE "ReferenceCenter" DROP COLUMN "altEmail",
DROP COLUMN "shortCode",
DROP COLUMN "venueId",
ADD COLUMN     "state" TEXT;

-- DropTable
DROP TABLE "Venue";

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCenter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "pincode" TEXT,
    "cityId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- AddForeignKey
ALTER TABLE "DiagnosticCenter" ADD CONSTRAINT "DiagnosticCenter_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticCenter" ADD CONSTRAINT "DiagnosticCenter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Center" ADD CONSTRAINT "Center_diagnosticCenterId_fkey" FOREIGN KEY ("diagnosticCenterId") REFERENCES "DiagnosticCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_refCenterId_fkey" FOREIGN KEY ("refCenterId") REFERENCES "ReferenceCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
