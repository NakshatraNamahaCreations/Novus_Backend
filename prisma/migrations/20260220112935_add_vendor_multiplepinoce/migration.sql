/*
  Warnings:

  - You are about to drop the column `pincode` on the `Vendor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "pincode";

-- CreateTable
CREATE TABLE "VendorPincode" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "pincode" TEXT NOT NULL,
    "priority" INTEGER DEFAULT 0,
    "radiusKm" INTEGER,

    CONSTRAINT "VendorPincode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPincode_pincode_idx" ON "VendorPincode"("pincode");

-- CreateIndex
CREATE INDEX "VendorPincode_vendorId_idx" ON "VendorPincode"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPincode_vendorId_pincode_key" ON "VendorPincode"("vendorId", "pincode");

-- AddForeignKey
ALTER TABLE "VendorPincode" ADD CONSTRAINT "VendorPincode_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPincode" ADD CONSTRAINT "VendorPincode_pincode_fkey" FOREIGN KEY ("pincode") REFERENCES "Pincode"("pincode") ON DELETE CASCADE ON UPDATE CASCADE;
