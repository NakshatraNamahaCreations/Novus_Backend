/*
  Warnings:

  - You are about to drop the column `createdBy` on the `Coupon` table. All the data in the column will be lost.
  - The `paymentStatus` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `Banner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Checkup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `EarningsHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Package` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `paymentMethod` on the `Payment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `ResultOption` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Slot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SpotlightBanner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SubCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VendorOrderRejection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VendorProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'CHEQUE', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "createdBy",
ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "EarningsHistory" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "OrderSlot" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ParameterRange" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "ParameterResult" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "PatientTestResult" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "capturedAmount" DOUBLE PRECISION,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "gatewayResponse" JSONB,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "paymentGatewayId" INTEGER,
ADD COLUMN     "paymentMode" "PaymentMode",
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "updatedById" INTEGER,
ADD COLUMN     "vendorId" INTEGER,
DROP COLUMN "paymentMethod",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL,
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "ReferenceCenter" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "ResultOption" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SpotlightBanner" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SubCategory" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "TestParameter" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "VendorOrderRejection" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "order_tracking" ADD COLUMN     "createdById" INTEGER;

-- CreateTable
CREATE TABLE "PaymentGateway" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gatewayKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookLog" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER,
    "gatewayId" INTEGER,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_name_key" ON "PaymentGateway"("name");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_patientId_idx" ON "Payment"("patientId");

-- CreateIndex
CREATE INDEX "Payment_vendorId_idx" ON "Payment"("vendorId");

-- CreateIndex
CREATE INDEX "Payment_centerId_idx" ON "Payment"("centerId");

-- CreateIndex
CREATE INDEX "Payment_paymentStatus_idx" ON "Payment"("paymentStatus");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE INDEX "Payment_referenceId_idx" ON "Payment"("referenceId");

-- CreateIndex
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotlightBanner" ADD CONSTRAINT "SpotlightBanner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCategory" ADD CONSTRAINT "SubCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkup" ADD CONSTRAINT "Checkup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsHistory" ADD CONSTRAINT "EarningsHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Center" ADD CONSTRAINT "Center_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOrderRejection" ADD CONSTRAINT "VendorOrderRejection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentGatewayId_fkey" FOREIGN KEY ("paymentGatewayId") REFERENCES "PaymentGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGateway" ADD CONSTRAINT "PaymentGateway_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookLog" ADD CONSTRAINT "PaymentWebhookLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookLog" ADD CONSTRAINT "PaymentWebhookLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookLog" ADD CONSTRAINT "PaymentWebhookLog_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_tracking" ADD CONSTRAINT "order_tracking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSlot" ADD CONSTRAINT "OrderSlot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceCenter" ADD CONSTRAINT "ReferenceCenter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestParameter" ADD CONSTRAINT "TestParameter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterRange" ADD CONSTRAINT "ParameterRange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultOption" ADD CONSTRAINT "ResultOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterResult" ADD CONSTRAINT "ParameterResult_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
