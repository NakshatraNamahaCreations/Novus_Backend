/*
  Warnings:

  - You are about to drop the column `deliveredAt` on the `OrderMemberPackage` table. All the data in the column will be lost.
  - You are about to drop the column `dispatchChannel` on the `OrderMemberPackage` table. All the data in the column will be lost.
  - You are about to drop the column `dispatchRef` on the `OrderMemberPackage` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "OrderMemberPackage" DROP COLUMN "deliveredAt",
DROP COLUMN "dispatchChannel",
DROP COLUMN "dispatchRef";
