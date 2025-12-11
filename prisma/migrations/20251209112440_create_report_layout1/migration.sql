-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" INTEGER,
ADD COLUMN     "discountAmount" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
