-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "sortOrder" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "sortOrder" INTEGER DEFAULT 0;

-- CreateIndex
CREATE INDEX "Checkup_categoryId_idx" ON "Checkup"("categoryId");

-- CreateIndex
CREATE INDEX "Checkup_categoryId_sortOrder_idx" ON "Checkup"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "Package_categoryId_idx" ON "Package"("categoryId");

-- CreateIndex
CREATE INDEX "Package_categoryId_sortOrder_idx" ON "Package"("categoryId", "sortOrder");
