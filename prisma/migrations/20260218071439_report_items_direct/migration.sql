/*
  Warnings:

  - You are about to drop the `TestTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TestTemplateBlock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TestTemplateBlockParameter` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ReportItemType" AS ENUM ('HEADING', 'PARAMETER', 'NOTES', 'RICH_TEXT');

-- DropForeignKey
ALTER TABLE "TestTemplate" DROP CONSTRAINT "TestTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TestTemplate" DROP CONSTRAINT "TestTemplate_testId_fkey";

-- DropForeignKey
ALTER TABLE "TestTemplateBlock" DROP CONSTRAINT "TestTemplateBlock_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TestTemplateBlock" DROP CONSTRAINT "TestTemplateBlock_templateId_fkey";

-- DropForeignKey
ALTER TABLE "TestTemplateBlockParameter" DROP CONSTRAINT "TestTemplateBlockParameter_blockId_fkey";

-- DropForeignKey
ALTER TABLE "TestTemplateBlockParameter" DROP CONSTRAINT "TestTemplateBlockParameter_parameterId_fkey";

-- DropTable
DROP TABLE "TestTemplate";

-- DropTable
DROP TABLE "TestTemplateBlock";

-- DropTable
DROP TABLE "TestTemplateBlockParameter";

-- DropEnum
DROP TYPE "GenderScope";

-- DropEnum
DROP TYPE "TestContentBlockType";

-- CreateTable
CREATE TABLE "TestReportItem" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "type" "ReportItemType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "text" TEXT,
    "html" TEXT,
    "parameterId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestReportItem_testId_idx" ON "TestReportItem"("testId");

-- CreateIndex
CREATE INDEX "TestReportItem_testId_sortOrder_idx" ON "TestReportItem"("testId", "sortOrder");

-- CreateIndex
CREATE INDEX "TestReportItem_parameterId_idx" ON "TestReportItem"("parameterId");

-- CreateIndex
CREATE INDEX "TestReportItem_createdById_idx" ON "TestReportItem"("createdById");

-- AddForeignKey
ALTER TABLE "TestReportItem" ADD CONSTRAINT "TestReportItem_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestReportItem" ADD CONSTRAINT "TestReportItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestReportItem" ADD CONSTRAINT "TestReportItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
