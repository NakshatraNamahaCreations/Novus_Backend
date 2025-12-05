-- DropForeignKey
ALTER TABLE "public"."Banner" DROP CONSTRAINT "Banner_subCategoryId_fkey";

-- AlterTable
ALTER TABLE "Banner" ALTER COLUMN "subCategoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
