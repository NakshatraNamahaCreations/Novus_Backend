-- CreateTable
CREATE TABLE "VendorEarningConfig" (
    "id" SERIAL NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "thresholdDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusForFiveStar" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorEarningConfig_pkey" PRIMARY KEY ("id")
);
