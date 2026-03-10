-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "source" TEXT DEFAULT 'app';

-- CreateTable
CREATE TABLE "CenterCategoryCommissionTest" (
    "id" SERIAL NOT NULL,
    "commissionId" INTEGER NOT NULL,
    "testId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterCategoryCommissionTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CenterCategoryCommissionTest_commissionId_idx" ON "CenterCategoryCommissionTest"("commissionId");

-- CreateIndex
CREATE INDEX "CenterCategoryCommissionTest_testId_idx" ON "CenterCategoryCommissionTest"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterCategoryCommissionTest_commissionId_testId_key" ON "CenterCategoryCommissionTest"("commissionId", "testId");

-- AddForeignKey
ALTER TABLE "CenterCategoryCommissionTest" ADD CONSTRAINT "CenterCategoryCommissionTest_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "CenterCategoryCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterCategoryCommissionTest" ADD CONSTRAINT "CenterCategoryCommissionTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
