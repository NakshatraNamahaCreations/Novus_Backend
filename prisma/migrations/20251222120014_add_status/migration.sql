/*
  Warnings:

  - You are about to drop the column `resultAdded` on the `OrderMemberPackage` table. All the data in the column will be lost.
  - The `status` column on the `PatientTestResult` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('DRAFT', 'REPORTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "OrderMemberPackage" DROP COLUMN "resultAdded";

-- AlterTable
ALTER TABLE "PatientTestResult" DROP COLUMN "status",
ADD COLUMN     "status" "TestResultStatus" NOT NULL DEFAULT 'DRAFT';
