/*
  Warnings:

  - You are about to drop the `VendorCurrentLocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VendorLocationHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "VendorCurrentLocation";

-- DropTable
DROP TABLE "VendorLocationHistory";

-- CreateTable
CREATE TABLE "order_tracking" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "userLatitude" DOUBLE PRECISION NOT NULL,
    "userLongitude" DOUBLE PRECISION NOT NULL,
    "vendorLatitude" DOUBLE PRECISION,
    "vendorLongitude" DOUBLE PRECISION,
    "vendorPath" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),

    CONSTRAINT "order_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_location" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_tracking_orderId_key" ON "order_tracking"("orderId");

-- AddForeignKey
ALTER TABLE "order_tracking" ADD CONSTRAINT "order_tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_location" ADD CONSTRAINT "vendor_location_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
