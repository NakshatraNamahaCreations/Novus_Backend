/*
  Warnings:

  - You are about to drop the column `min` on the `CollectionPrice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CollectionPrice" DROP COLUMN "min",
ADD COLUMN     "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 299;
