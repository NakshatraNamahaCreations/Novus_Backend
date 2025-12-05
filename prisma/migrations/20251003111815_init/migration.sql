/*
  Warnings:

  - You are about to drop the column `isActive` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Patient` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[contactNo]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "phone",
ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "contactNo" TEXT,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otp" TEXT,
ADD COLUMN     "otpExpiry" TIMESTAMP(3),
ADD COLUMN     "primaryId" INTEGER,
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_contactNo_key" ON "Patient"("contactNo");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_primaryId_fkey" FOREIGN KEY ("primaryId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
