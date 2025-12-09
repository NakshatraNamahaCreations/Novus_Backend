/*
  Warnings:

  - You are about to drop the `_CategoryToHealthPackage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CategoryToHealthPackage" DROP CONSTRAINT "_CategoryToHealthPackage_A_fkey";

-- DropForeignKey
ALTER TABLE "_CategoryToHealthPackage" DROP CONSTRAINT "_CategoryToHealthPackage_B_fkey";

-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "categoryId" INTEGER;

-- DropTable
DROP TABLE "_CategoryToHealthPackage";

-- AddForeignKey
ALTER TABLE "Checkup" ADD CONSTRAINT "Checkup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
