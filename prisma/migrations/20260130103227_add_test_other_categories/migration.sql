-- CreateTable
CREATE TABLE "TestOtherCategory" (
    "testId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestOtherCategory_pkey" PRIMARY KEY ("testId","categoryId")
);

-- CreateIndex
CREATE INDEX "TestOtherCategory_categoryId_idx" ON "TestOtherCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "TestOtherCategory" ADD CONSTRAINT "TestOtherCategory_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestOtherCategory" ADD CONSTRAINT "TestOtherCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
