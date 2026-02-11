-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "diagnosticCenterId" INTEGER;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_diagnosticCenterId_fkey" FOREIGN KEY ("diagnosticCenterId") REFERENCES "DiagnosticCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
