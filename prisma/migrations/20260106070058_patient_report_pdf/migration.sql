/*
  Warnings:

  - The values [NETBANKING] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'CARD', 'UPI', 'NET_BANKING', 'WALLET', 'CHEQUE', 'BANK_TRANSFER');
ALTER TABLE "Payment" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- CreateTable
CREATE TABLE "PatientReportPdf" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "plainPdfUrl" TEXT,
    "letterheadPdfUrl" TEXT,
    "fullPdfUrl" TEXT,
    "plainPdfKey" TEXT,
    "letterheadPdfKey" TEXT,
    "fullPdfKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
    "generatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientReportPdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientReportPdf_orderId_idx" ON "PatientReportPdf"("orderId");

-- CreateIndex
CREATE INDEX "PatientReportPdf_patientId_idx" ON "PatientReportPdf"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientReportPdf_orderId_patientId_key" ON "PatientReportPdf"("orderId", "patientId");
