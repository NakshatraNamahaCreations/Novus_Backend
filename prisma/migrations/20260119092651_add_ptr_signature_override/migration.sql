-- AlterTable
ALTER TABLE "PatientTestResult" ADD COLUMN     "centerSignatureId" INTEGER,
ADD COLUMN     "leftSignatureId" INTEGER,
ADD COLUMN     "rightSignatureId" INTEGER;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_leftSignatureId_fkey" FOREIGN KEY ("leftSignatureId") REFERENCES "ESignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_centerSignatureId_fkey" FOREIGN KEY ("centerSignatureId") REFERENCES "ESignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_rightSignatureId_fkey" FOREIGN KEY ("rightSignatureId") REFERENCES "ESignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
