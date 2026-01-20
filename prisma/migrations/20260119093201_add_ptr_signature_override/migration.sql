-- CreateIndex
CREATE INDEX "PatientTestResult_orderId_idx" ON "PatientTestResult"("orderId");

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
