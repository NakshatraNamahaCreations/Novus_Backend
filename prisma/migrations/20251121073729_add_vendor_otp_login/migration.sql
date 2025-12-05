-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "otp" TEXT,
ADD COLUMN     "otpExpiry" TIMESTAMP(3);
