/*
  Warnings:

  - Added the required column `reportWithin` to the `Package` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "reportUnit" TEXT NOT NULL DEFAULT 'hours',
ADD COLUMN     "reportWithin" INTEGER NOT NULL;
