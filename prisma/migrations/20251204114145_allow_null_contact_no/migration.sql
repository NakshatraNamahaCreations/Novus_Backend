/*
  Warnings:

  - A unique constraint covering the columns `[contactNo]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "initial" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_contactNo_key" ON "Patient"("contactNo");
