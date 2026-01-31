/*
  Warnings:

  - You are about to drop the column `createdById` on the `Cart` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_createdById_fkey";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "createdById",
ADD COLUMN     "adminRemark" TEXT,
ADD COLUMN     "remarkUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "remarkUpdatedById" INTEGER;

-- CreateIndex
CREATE INDEX "Cart_patientId_idx" ON "Cart"("patientId");

-- CreateIndex
CREATE INDEX "Cart_status_idx" ON "Cart"("status");

-- CreateIndex
CREATE INDEX "Cart_remarkUpdatedById_idx" ON "Cart"("remarkUpdatedById");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_remarkUpdatedById_fkey" FOREIGN KEY ("remarkUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
