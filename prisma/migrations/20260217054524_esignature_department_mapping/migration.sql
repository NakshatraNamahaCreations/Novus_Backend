/*
  Warnings:

  - You are about to drop the `ESignatureCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ESignatureCategory" DROP CONSTRAINT "ESignatureCategory_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "ESignatureCategory" DROP CONSTRAINT "ESignatureCategory_signatureId_fkey";

-- DropTable
DROP TABLE "ESignatureCategory";

-- CreateTable
CREATE TABLE "ESignatureDepartment" (
    "id" SERIAL NOT NULL,
    "signatureId" INTEGER NOT NULL,
    "departmentItemId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ESignatureDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ESignatureDepartment_departmentItemId_idx" ON "ESignatureDepartment"("departmentItemId");

-- CreateIndex
CREATE INDEX "ESignatureDepartment_signatureId_idx" ON "ESignatureDepartment"("signatureId");

-- CreateIndex
CREATE INDEX "ESignatureDepartment_isDefault_idx" ON "ESignatureDepartment"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ESignatureDepartment_signatureId_departmentItemId_key" ON "ESignatureDepartment"("signatureId", "departmentItemId");

-- AddForeignKey
ALTER TABLE "ESignatureDepartment" ADD CONSTRAINT "ESignatureDepartment_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "ESignature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ESignatureDepartment" ADD CONSTRAINT "ESignatureDepartment_departmentItemId_fkey" FOREIGN KEY ("departmentItemId") REFERENCES "DepartmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
