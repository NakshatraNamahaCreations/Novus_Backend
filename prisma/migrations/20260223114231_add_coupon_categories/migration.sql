-- CreateEnum
CREATE TYPE "CouponCategoryScope" AS ENUM ('ALL', 'INCLUDE', 'EXCLUDE');

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "categoryScope" "CouponCategoryScope" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "CouponCategory" (
    "id" SERIAL NOT NULL,
    "couponId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponCategory_couponId_idx" ON "CouponCategory"("couponId");

-- CreateIndex
CREATE INDEX "CouponCategory_categoryId_idx" ON "CouponCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponCategory_couponId_categoryId_key" ON "CouponCategory"("couponId", "categoryId");

-- AddForeignKey
ALTER TABLE "CouponCategory" ADD CONSTRAINT "CouponCategory_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCategory" ADD CONSTRAINT "CouponCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
