/*
  Warnings:

  - You are about to drop the column `discount` on the `Coupon` table. All the data in the column will be lost.
  - Added the required column `discountValue` to the `Coupon` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Coupon` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "discount",
ADD COLUMN     "autoApply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'percentage',
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "maxDiscount" DOUBLE PRECISION,
ADD COLUMN     "minOrderAmount" DOUBLE PRECISION,
ADD COLUMN     "perUserLimit" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "usageLimit" INTEGER;

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" SERIAL NOT NULL,
    "couponId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
