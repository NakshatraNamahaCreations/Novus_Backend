/*
  Warnings:

  - You are about to drop the column `addressId` on the `Patient` table. All the data in the column will be lost.
  - Made the column `patientId` on table `Address` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Address" DROP CONSTRAINT "Address_patientId_fkey";

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "addressId";

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
