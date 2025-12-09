/*
  Warnings:

  - You are about to drop the column `password` on the `Center` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[mobile]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Center" DROP COLUMN "password",
ADD COLUMN     "account" TEXT,
ADD COLUMN     "alternativeEmail" TEXT,
ADD COLUMN     "billType" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "emailReportConfig" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'PrePaid',
ADD COLUMN     "sendBillToPatient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendReportToPatient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "venue" TEXT,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "long" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "consultingDoctor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "initial" TEXT,
ADD COLUMN     "landLine" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "otherInfo" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "refCenter" TEXT,
ADD COLUMN     "sendEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendSms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "speciality" TEXT,
ADD COLUMN     "specialityType" TEXT,
ADD COLUMN     "venue" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_mobile_key" ON "Doctor"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");
