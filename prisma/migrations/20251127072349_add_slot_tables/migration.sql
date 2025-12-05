-- CreateTable
CREATE TABLE "Slot" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "startTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSlot" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderSlot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderSlot" ADD CONSTRAINT "OrderSlot_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
