/*
  Warnings:

  - A unique constraint covering the columns `[centerId,categoryId,name]` on the table `CenterSlot` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CenterSlot" ADD COLUMN     "categoryId" INTEGER;

-- CreateIndex
CREATE INDEX "CenterSlot_centerId_idx" ON "CenterSlot"("centerId");

-- CreateIndex
CREATE INDEX "CenterSlot_categoryId_idx" ON "CenterSlot"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterSlot_centerId_categoryId_name_key" ON "CenterSlot"("centerId", "categoryId", "name");

-- AddForeignKey
ALTER TABLE "CenterSlot" ADD CONSTRAINT "CenterSlot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
