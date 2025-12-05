-- DropForeignKey
ALTER TABLE "OrderMemberPackage" DROP CONSTRAINT "OrderMemberPackage_packageId_fkey";

-- AlterTable
ALTER TABLE "OrderMemberPackage" ADD COLUMN     "testId" INTEGER,
ALTER COLUMN "packageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Checkup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
