/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Center` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Center` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `Center` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."CenterPackage" DROP CONSTRAINT "CenterPackage_centerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CenterPackage" DROP CONSTRAINT "CenterPackage_packageId_fkey";

-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE UNIQUE INDEX "Center_email_key" ON "Center"("email");

-- AddForeignKey
ALTER TABLE "CenterPackage" ADD CONSTRAINT "CenterPackage_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterPackage" ADD CONSTRAINT "CenterPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
