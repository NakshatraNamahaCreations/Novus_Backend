-- CreateTable
CREATE TABLE "SlotDayConfig" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotDayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotDateOverride" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotDayConfig_slotId_idx" ON "SlotDayConfig"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotDayConfig_slotId_dayOfWeek_key" ON "SlotDayConfig"("slotId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "SlotDateOverride_slotId_idx" ON "SlotDateOverride"("slotId");

-- CreateIndex
CREATE INDEX "SlotDateOverride_date_idx" ON "SlotDateOverride"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SlotDateOverride_slotId_date_key" ON "SlotDateOverride"("slotId", "date");

-- AddForeignKey
ALTER TABLE "SlotDayConfig" ADD CONSTRAINT "SlotDayConfig_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotDateOverride" ADD CONSTRAINT "SlotDateOverride_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
