-- CreateTable
CREATE TABLE "Pincode" (
    "id" SERIAL NOT NULL,
    "pincode" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "area" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pincode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pincode_pincode_key" ON "Pincode"("pincode");
