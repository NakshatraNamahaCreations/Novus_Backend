/*
  Warnings:

  - You are about to drop the column `subtitle` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Package` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Package" DROP COLUMN "subtitle",
DROP COLUMN "title",
ADD COLUMN     "noOfParameter" TEXT;
