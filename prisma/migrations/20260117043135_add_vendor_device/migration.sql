-- CreateTable
CREATE TABLE "VendorDevice" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorDevice_fcmToken_key" ON "VendorDevice"("fcmToken");

-- CreateIndex
CREATE INDEX "VendorDevice_vendorId_idx" ON "VendorDevice"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorDevice" ADD CONSTRAINT "VendorDevice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
