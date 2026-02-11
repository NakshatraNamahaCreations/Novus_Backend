/*
  Warnings:

  - You are about to drop the `UserCenter` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserCenter" DROP CONSTRAINT "UserCenter_centerId_fkey";

-- DropForeignKey
ALTER TABLE "UserCenter" DROP CONSTRAINT "UserCenter_userId_fkey";

-- DropTable
DROP TABLE "UserCenter";

-- CreateTable
CREATE TABLE "UserDiagnosticCenter" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "diagnosticCenterId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDiagnosticCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDiagnosticCenter_userId_idx" ON "UserDiagnosticCenter"("userId");

-- CreateIndex
CREATE INDEX "UserDiagnosticCenter_diagnosticCenterId_idx" ON "UserDiagnosticCenter"("diagnosticCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDiagnosticCenter_userId_diagnosticCenterId_key" ON "UserDiagnosticCenter"("userId", "diagnosticCenterId");

-- AddForeignKey
ALTER TABLE "UserDiagnosticCenter" ADD CONSTRAINT "UserDiagnosticCenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiagnosticCenter" ADD CONSTRAINT "UserDiagnosticCenter_diagnosticCenterId_fkey" FOREIGN KEY ("diagnosticCenterId") REFERENCES "DiagnosticCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
