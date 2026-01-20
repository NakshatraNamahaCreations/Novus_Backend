/*
  Warnings:

  - Added the required column `updatedAt` to the `OrderMemberPackage` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReportDispatchStatus" AS ENUM ('NOT_READY', 'READY', 'DISPATCHED', 'DELIVERED');

-- AlterTable
ALTER TABLE "OrderMemberPackage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "dispatchChannel" TEXT,
ADD COLUMN     "dispatchRef" TEXT,
ADD COLUMN     "dispatchStatus" "ReportDispatchStatus" NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "reportDueAt" TIMESTAMP(3),
ADD COLUMN     "reportUnit" TEXT,
ADD COLUMN     "reportWithin" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "OrderMemberPackage_orderMemberId_idx" ON "OrderMemberPackage"("orderMemberId");

-- CreateIndex
CREATE INDEX "OrderMemberPackage_packageId_idx" ON "OrderMemberPackage"("packageId");

-- CreateIndex
CREATE INDEX "OrderMemberPackage_testId_idx" ON "OrderMemberPackage"("testId");

-- CreateIndex
CREATE INDEX "OrderMemberPackage_dispatchStatus_idx" ON "OrderMemberPackage"("dispatchStatus");

-- CreateIndex
CREATE INDEX "OrderMemberPackage_reportDueAt_idx" ON "OrderMemberPackage"("reportDueAt");
