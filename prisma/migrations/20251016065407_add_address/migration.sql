-- DropForeignKey
ALTER TABLE "public"."Patient" DROP CONSTRAINT "Patient_addressId_fkey";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "patientId" INTEGER;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
