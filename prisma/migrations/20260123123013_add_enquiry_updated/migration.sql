/*
  Warnings:

  - Made the column `name` on table `Enquiry` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "patientId" INTEGER,
ALTER COLUMN "name" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Enquiry_patientId_idx" ON "Enquiry"("patientId");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
