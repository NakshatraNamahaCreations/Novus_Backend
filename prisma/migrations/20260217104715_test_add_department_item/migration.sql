-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "departmentItemId" INTEGER;

-- CreateIndex
CREATE INDEX "Package_departmentItemId_idx" ON "Package"("departmentItemId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_departmentItemId_fkey" FOREIGN KEY ("departmentItemId") REFERENCES "DepartmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
