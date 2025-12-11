-- CreateTable
CREATE TABLE "CenterSlot" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "name" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterCategory" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterSlotBooking" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CenterSlotBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CenterCategory_centerId_categoryId_key" ON "CenterCategory"("centerId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterSlotBooking_slotId_date_key" ON "CenterSlotBooking"("slotId", "date");

-- AddForeignKey
ALTER TABLE "CenterSlot" ADD CONSTRAINT "CenterSlot_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterCategory" ADD CONSTRAINT "CenterCategory_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterCategory" ADD CONSTRAINT "CenterCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterSlotBooking" ADD CONSTRAINT "CenterSlotBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CenterSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
