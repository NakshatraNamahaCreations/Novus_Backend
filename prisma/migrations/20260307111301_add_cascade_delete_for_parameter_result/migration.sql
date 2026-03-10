-- DropForeignKey
ALTER TABLE "ParameterResult" DROP CONSTRAINT "ParameterResult_parameterId_fkey";

-- AddForeignKey
ALTER TABLE "ParameterResult" ADD CONSTRAINT "ParameterResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
