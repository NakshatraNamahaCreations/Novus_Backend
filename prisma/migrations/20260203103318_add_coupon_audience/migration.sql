-- CreateEnum
CREATE TYPE "CouponAudience" AS ENUM ('ALL', 'NEW_PATIENT', 'EXISTING_PATIENT');

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "audience" "CouponAudience" NOT NULL DEFAULT 'ALL';
