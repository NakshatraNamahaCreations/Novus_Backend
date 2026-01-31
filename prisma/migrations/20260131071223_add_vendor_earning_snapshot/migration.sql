/*
  Warnings:

  - A unique constraint covering the columns `[vendorId]` on the table `VendorEarningConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "VendorEarningStatus" AS ENUM ('PENDING', 'CALCULATED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "VendorEarningConfig" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vendorId" INTEGER,
ALTER COLUMN "bonusForFiveStar" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderVendorEarning" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraKmAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEarning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perKmRateSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thresholdDistanceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "VendorEarningStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderVendorEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderVendorEarning_orderId_key" ON "OrderVendorEarning"("orderId");

-- CreateIndex
CREATE INDEX "OrderVendorEarning_vendorId_idx" ON "OrderVendorEarning"("vendorId");

-- CreateIndex
CREATE INDEX "OrderVendorEarning_status_idx" ON "OrderVendorEarning"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorEarningConfig_vendorId_key" ON "VendorEarningConfig"("vendorId");

-- CreateIndex
CREATE INDEX "VendorEarningConfig_vendorId_idx" ON "VendorEarningConfig"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorEarningConfig" ADD CONSTRAINT "VendorEarningConfig_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderVendorEarning" ADD CONSTRAINT "OrderVendorEarning_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderVendorEarning" ADD CONSTRAINT "OrderVendorEarning_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
