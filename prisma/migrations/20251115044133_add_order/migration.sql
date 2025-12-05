/*
  Warnings:

  - You are about to drop the column `patientImage` on the `Order` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_vendorId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "patientImage",
ADD COLUMN     "doctorId" INTEGER,
ADD COLUMN     "isSelf" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderType" TEXT,
ALTER COLUMN "vendorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
