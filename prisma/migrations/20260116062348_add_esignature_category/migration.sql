/*
  Warnings:

  - You are about to drop the column `categories` on the `ESignature` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ESignature` table. All the data in the column will be lost.
  - You are about to drop the column `isDefault` on the `ESignature` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ESignature` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ESignature" DROP COLUMN "categories",
DROP COLUMN "createdAt",
DROP COLUMN "isDefault",
DROP COLUMN "updatedAt";

-- CreateTable
CREATE TABLE "ESignatureCategory" (
    "id" SERIAL NOT NULL,
    "signatureId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ESignatureCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ESignatureCategory_categoryId_idx" ON "ESignatureCategory"("categoryId");

-- CreateIndex
CREATE INDEX "ESignatureCategory_signatureId_idx" ON "ESignatureCategory"("signatureId");

-- CreateIndex
CREATE INDEX "ESignatureCategory_isDefault_idx" ON "ESignatureCategory"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ESignatureCategory_signatureId_categoryId_key" ON "ESignatureCategory"("signatureId", "categoryId");

-- AddForeignKey
ALTER TABLE "ESignatureCategory" ADD CONSTRAINT "ESignatureCategory_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "ESignature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ESignatureCategory" ADD CONSTRAINT "ESignatureCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
