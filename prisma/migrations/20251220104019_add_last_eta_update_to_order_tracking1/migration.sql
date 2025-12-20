-- AlterTable
ALTER TABLE "vendor_location" ADD COLUMN     "orderId" INTEGER;

-- CreateIndex
CREATE INDEX "vendor_location_vendorId_idx" ON "vendor_location"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_location_orderId_idx" ON "vendor_location"("orderId");

-- CreateIndex
CREATE INDEX "vendor_location_createdAt_idx" ON "vendor_location"("createdAt");
