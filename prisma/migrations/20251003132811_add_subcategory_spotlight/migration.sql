/*
  Warnings:

  - You are about to drop the column `packageId` on the `SpotlightBanner` table. All the data in the column will be lost.
  - Added the required column `subCategoryId` to the `SpotlightBanner` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."SpotlightBanner" DROP CONSTRAINT "SpotlightBanner_packageId_fkey";

-- AlterTable
ALTER TABLE "SpotlightBanner" DROP COLUMN "packageId",
ADD COLUMN     "subCategoryId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "SpotlightBanner" ADD CONSTRAINT "SpotlightBanner_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
