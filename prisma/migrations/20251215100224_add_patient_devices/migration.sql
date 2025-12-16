/*
  Warnings:

  - You are about to drop the column `deviceToken` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `fcmToken` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "deviceToken",
DROP COLUMN "fcmToken";

-- CreateTable
CREATE TABLE "PatientDevice" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDevice_fcmToken_key" ON "PatientDevice"("fcmToken");

-- AddForeignKey
ALTER TABLE "PatientDevice" ADD CONSTRAINT "PatientDevice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
