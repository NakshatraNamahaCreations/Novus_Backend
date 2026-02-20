/*
  Warnings:

  - You are about to drop the column `departmentItemId` on the `Category` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_departmentItemId_fkey";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "departmentItemId";
