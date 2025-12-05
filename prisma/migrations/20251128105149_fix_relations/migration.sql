/*
  Warnings:

  - You are about to drop the column `testId` on the `OrderMemberPackage` table. All the data in the column will be lost.
  - Added the required column `packageId` to the `OrderMemberPackage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "OrderMemberPackage" DROP CONSTRAINT "OrderMemberPackage_testId_fkey";

-- AlterTable
ALTER TABLE "OrderMemberPackage" DROP COLUMN "testId",
ADD COLUMN     "packageId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
