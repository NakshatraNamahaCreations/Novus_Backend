/*
  Warnings:

  - You are about to drop the column `subCategoryId` on the `Banner` table. All the data in the column will be lost.
  - You are about to drop the column `subCategoryId` on the `SpotlightBanner` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SpotlightShowIn" AS ENUM ('HOME_MIDDLE', 'HOME_END');

-- DropForeignKey
ALTER TABLE "Banner" DROP CONSTRAINT "Banner_subCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "SpotlightBanner" DROP CONSTRAINT "SpotlightBanner_subCategoryId_fkey";

-- AlterTable
ALTER TABLE "Banner" DROP COLUMN "subCategoryId",
ADD COLUMN     "packageId" INTEGER,
ADD COLUMN     "testId" INTEGER;

-- AlterTable
ALTER TABLE "SpotlightBanner" DROP COLUMN "subCategoryId",
ADD COLUMN     "packageId" INTEGER,
ADD COLUMN     "showIn" "SpotlightShowIn"[],
ADD COLUMN     "testId" INTEGER;

-- CreateTable
CREATE TABLE "CollectionPrice" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER,
    "cityId" INTEGER,
    "pincode" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionPrice_centerId_idx" ON "CollectionPrice"("centerId");

-- CreateIndex
CREATE INDEX "CollectionPrice_cityId_idx" ON "CollectionPrice"("cityId");

-- CreateIndex
CREATE INDEX "CollectionPrice_pincode_idx" ON "CollectionPrice"("pincode");

-- CreateIndex
CREATE INDEX "Banner_testId_idx" ON "Banner"("testId");

-- CreateIndex
CREATE INDEX "Banner_packageId_idx" ON "Banner"("packageId");

-- CreateIndex
CREATE INDEX "Banner_createdById_idx" ON "Banner"("createdById");

-- CreateIndex
CREATE INDEX "SpotlightBanner_testId_idx" ON "SpotlightBanner"("testId");

-- CreateIndex
CREATE INDEX "SpotlightBanner_packageId_idx" ON "SpotlightBanner"("packageId");

-- CreateIndex
CREATE INDEX "SpotlightBanner_createdById_idx" ON "SpotlightBanner"("createdById");

-- CreateIndex
CREATE INDEX "SpotlightBanner_showIn_idx" ON "SpotlightBanner"("showIn");

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotlightBanner" ADD CONSTRAINT "SpotlightBanner_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotlightBanner" ADD CONSTRAINT "SpotlightBanner_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPrice" ADD CONSTRAINT "CollectionPrice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPrice" ADD CONSTRAINT "CollectionPrice_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPrice" ADD CONSTRAINT "CollectionPrice_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
