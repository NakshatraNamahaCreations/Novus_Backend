-- DropForeignKey
ALTER TABLE "VendorReview" DROP CONSTRAINT "VendorReview_orderId_fkey";

-- AlterTable
ALTER TABLE "VendorReview" ALTER COLUMN "orderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
