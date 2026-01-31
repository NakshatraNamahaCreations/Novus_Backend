-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "rescheduledAt" TIMESTAMP(3),
ADD COLUMN     "rescheduledById" INTEGER;

-- CreateTable
CREATE TABLE "CenterCategoryCommission" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "type" "CommissionType" NOT NULL DEFAULT 'PERCENT',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterCategoryCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CenterCategoryCommission_centerId_idx" ON "CenterCategoryCommission"("centerId");

-- CreateIndex
CREATE INDEX "CenterCategoryCommission_categoryId_idx" ON "CenterCategoryCommission"("categoryId");

-- CreateIndex
CREATE INDEX "CenterCategoryCommission_createdById_idx" ON "CenterCategoryCommission"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CenterCategoryCommission_centerId_categoryId_key" ON "CenterCategoryCommission"("centerId", "categoryId");

-- AddForeignKey
ALTER TABLE "CenterCategoryCommission" ADD CONSTRAINT "CenterCategoryCommission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterCategoryCommission" ADD CONSTRAINT "CenterCategoryCommission_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterCategoryCommission" ADD CONSTRAINT "CenterCategoryCommission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_rescheduledById_fkey" FOREIGN KEY ("rescheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
