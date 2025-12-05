/*
  Warnings:

  - You are about to drop the column `packageId` on the `Banner` table. All the data in the column will be lost.
  - Added the required column `subCategoryId` to the `Banner` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Banner" DROP CONSTRAINT "Banner_packageId_fkey";

-- AlterTable
ALTER TABLE "Banner" DROP COLUMN "packageId",
ADD COLUMN     "subCategoryId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
