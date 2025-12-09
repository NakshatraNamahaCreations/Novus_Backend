/*
  Warnings:

  - You are about to drop the column `expiryDate` on the `Coupon` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Coupon` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `CouponUsage` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[couponId,patientId,orderId]` on the table `CouponUsage` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `patientId` to the `CouponUsage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CouponUsage" DROP CONSTRAINT "CouponUsage_userId_fkey";

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "expiryDate",
DROP COLUMN "startDate",
ADD COLUMN     "isPatientCoupon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patientId" INTEGER,
ADD COLUMN     "usedCount" INTEGER DEFAULT 0,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CouponUsage" DROP COLUMN "userId",
ADD COLUMN     "patientId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_couponId_patientId_orderId_key" ON "CouponUsage"("couponId", "patientId", "orderId");

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
