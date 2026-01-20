-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- CreateTable
CREATE TABLE "VendorAttendance" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "checkInAt" TIMESTAMP(3),
    "selfieUrl" TEXT,
    "selfieKey" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "selfieDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorAttendance_day_idx" ON "VendorAttendance"("day");

-- CreateIndex
CREATE INDEX "VendorAttendance_vendorId_idx" ON "VendorAttendance"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAttendance_vendorId_day_key" ON "VendorAttendance"("vendorId", "day");

-- AddForeignKey
ALTER TABLE "VendorAttendance" ADD CONSTRAINT "VendorAttendance_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
