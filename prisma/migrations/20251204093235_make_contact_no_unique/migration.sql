/*
  Warnings:

  - You are about to drop the column `vendorId` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "vendorId",
ADD COLUMN     "userId" INTEGER;
