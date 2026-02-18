-- DropForeignKey
ALTER TABLE "TestReportItem" DROP CONSTRAINT "TestReportItem_parameterId_fkey";

-- AddForeignKey
ALTER TABLE "TestReportItem" ADD CONSTRAINT "TestReportItem_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
