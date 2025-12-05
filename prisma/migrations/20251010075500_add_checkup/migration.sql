-- CreateEnum
CREATE TYPE "ShowIn" AS ENUM ('HOME', 'TEST', 'OFFER');

-- CreateTable
CREATE TABLE "Checkup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imgUrl" TEXT,
    "actualPrice" DOUBLE PRECISION NOT NULL,
    "offerPrice" DOUBLE PRECISION,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "showIn" "ShowIn" DEFAULT 'TEST',

    CONSTRAINT "Checkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckupPackage" (
    "id" SERIAL NOT NULL,
    "checkupId" INTEGER NOT NULL,
    "packageId" INTEGER NOT NULL,

    CONSTRAINT "CheckupPackage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CheckupPackage" ADD CONSTRAINT "CheckupPackage_checkupId_fkey" FOREIGN KEY ("checkupId") REFERENCES "Checkup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckupPackage" ADD CONSTRAINT "CheckupPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
