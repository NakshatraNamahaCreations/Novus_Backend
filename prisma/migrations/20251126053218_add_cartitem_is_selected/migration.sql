/*
  Warnings:

  - A unique constraint covering the columns `[merchantOrderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "isSelected" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "merchantOrderId" TEXT;

-- CreateTable
CREATE TABLE "VendorOrderRejection" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorOrderRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantOrderId_key" ON "Order"("merchantOrderId");
