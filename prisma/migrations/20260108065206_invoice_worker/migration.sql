-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "bannerUrl" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "invoiceUrl" TEXT;

-- CreateTable
CREATE TABLE "Sources" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sources_name_key" ON "Sources"("name");
