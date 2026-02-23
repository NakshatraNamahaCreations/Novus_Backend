/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `VendorReview` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orderId` to the `VendorReview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "VendorReview" ADD COLUMN     "orderId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "VendorReview_orderId_key" ON "VendorReview"("orderId");

-- AddForeignKey
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
