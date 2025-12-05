/*
  Warnings:

  - A unique constraint covering the columns `[orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `date` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderNumber` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `packages` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_centerId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "discount" DOUBLE PRECISION,
ADD COLUMN     "documentImage" TEXT,
ADD COLUMN     "finalAmount" DOUBLE PRECISION,
ADD COLUMN     "isHomeSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderNumber" TEXT NOT NULL,
ADD COLUMN     "packages" JSONB NOT NULL,
ADD COLUMN     "paymentMode" TEXT,
ADD COLUMN     "paymentStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "reportReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reportUrl" TEXT,
ADD COLUMN     "sampleCollected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slot" TEXT,
ADD COLUMN     "trackingId" TEXT,
ALTER COLUMN "centerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
