-- CreateEnum
CREATE TYPE "TestContentBlockType" AS ENUM ('TEST_HEADING', 'PARAMETERS', 'MULTI_PARAMETERS', 'NOTES', 'RICH_TEXT', 'FREE_TEXT', 'TABLE_FORMAT', 'ANTIBIOTIC_LIST', 'HTML_TABLE_PARAMETER', 'TEMPLATE_CONTENT');

-- CreateEnum
CREATE TYPE "GenderScope" AS ENUM ('ALL', 'MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('RADIOLOGY', 'PATHOLOGY');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "departmentItemId" INTEGER;

-- CreateTable
CREATE TABLE "TestTemplate" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Template',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestTemplateBlock" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "type" "TestContentBlockType" NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "html" TEXT,
    "data" JSONB,
    "settings" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "genderScope" "GenderScope" NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestTemplateBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestTemplateBlockParameter" (
    "id" SERIAL NOT NULL,
    "blockId" INTEGER NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestTemplateBlockParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DepartmentType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestTemplate_testId_key" ON "TestTemplate"("testId");

-- CreateIndex
CREATE INDEX "TestTemplate_createdById_idx" ON "TestTemplate"("createdById");

-- CreateIndex
CREATE INDEX "TestTemplateBlock_templateId_idx" ON "TestTemplateBlock"("templateId");

-- CreateIndex
CREATE INDEX "TestTemplateBlock_type_idx" ON "TestTemplateBlock"("type");

-- CreateIndex
CREATE INDEX "TestTemplateBlock_templateId_sortOrder_idx" ON "TestTemplateBlock"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "TestTemplateBlock_genderScope_idx" ON "TestTemplateBlock"("genderScope");

-- CreateIndex
CREATE INDEX "TestTemplateBlock_createdById_idx" ON "TestTemplateBlock"("createdById");

-- CreateIndex
CREATE INDEX "TestTemplateBlockParameter_blockId_idx" ON "TestTemplateBlockParameter"("blockId");

-- CreateIndex
CREATE INDEX "TestTemplateBlockParameter_parameterId_idx" ON "TestTemplateBlockParameter"("parameterId");

-- CreateIndex
CREATE INDEX "TestTemplateBlockParameter_blockId_sortOrder_idx" ON "TestTemplateBlockParameter"("blockId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TestTemplateBlockParameter_blockId_parameterId_key" ON "TestTemplateBlockParameter"("blockId", "parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentItem_name_key" ON "DepartmentItem"("name");

-- CreateIndex
CREATE INDEX "DepartmentItem_type_idx" ON "DepartmentItem"("type");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_departmentItemId_fkey" FOREIGN KEY ("departmentItemId") REFERENCES "DepartmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplate" ADD CONSTRAINT "TestTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplate" ADD CONSTRAINT "TestTemplate_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplateBlock" ADD CONSTRAINT "TestTemplateBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplateBlock" ADD CONSTRAINT "TestTemplateBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TestTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplateBlockParameter" ADD CONSTRAINT "TestTemplateBlockParameter_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "TestTemplateBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTemplateBlockParameter" ADD CONSTRAINT "TestTemplateBlockParameter_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
