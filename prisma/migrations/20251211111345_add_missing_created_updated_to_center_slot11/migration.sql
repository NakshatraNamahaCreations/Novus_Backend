-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_diagnosticCenterId_fkey" FOREIGN KEY ("diagnosticCenterId") REFERENCES "DiagnosticCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
