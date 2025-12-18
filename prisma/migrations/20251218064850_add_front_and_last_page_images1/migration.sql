/*
  Warnings:

  - You are about to drop the column `isDefault` on the `ReportLayout` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[singletonKey]` on the table `ReportLayout` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ReportLayout" DROP COLUMN "isDefault",
ADD COLUMN     "singletonKey" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "ReportLayout_singletonKey_key" ON "ReportLayout"("singletonKey");
