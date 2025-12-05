-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "earnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pincode" INTEGER,
ADD COLUMN     "radius" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'inactive';

-- CreateTable
CREATE TABLE "EarningsHistory" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarningsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCurrentLocation" (
    "vendorId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorCurrentLocation_pkey" PRIMARY KEY ("vendorId")
);

-- CreateTable
CREATE TABLE "VendorLocationHistory" (
    "id" SERIAL NOT NULL,
    "vendorId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLocationHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EarningsHistory" ADD CONSTRAINT "EarningsHistory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
