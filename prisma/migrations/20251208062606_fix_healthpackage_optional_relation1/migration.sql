/*
  Warnings:

  - You are about to drop the column `numberOfTests` on the `Package` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "testType" TEXT;

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "numberOfTests";
