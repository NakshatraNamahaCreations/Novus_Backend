-- CreateTable
CREATE TABLE "CenterSlotDayConfig" (
    "id" SERIAL NOT NULL,
    "centerSlotId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterSlotDayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterSlotDateOverride" (
    "id" SERIAL NOT NULL,
    "centerSlotId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterSlotDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CenterSlotDayConfig_centerSlotId_idx" ON "CenterSlotDayConfig"("centerSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterSlotDayConfig_centerSlotId_dayOfWeek_key" ON "CenterSlotDayConfig"("centerSlotId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CenterSlotDateOverride_centerSlotId_idx" ON "CenterSlotDateOverride"("centerSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterSlotDateOverride_centerSlotId_date_key" ON "CenterSlotDateOverride"("centerSlotId", "date");

-- AddForeignKey
ALTER TABLE "CenterSlotDayConfig" ADD CONSTRAINT "CenterSlotDayConfig_centerSlotId_fkey" FOREIGN KEY ("centerSlotId") REFERENCES "CenterSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterSlotDateOverride" ADD CONSTRAINT "CenterSlotDateOverride_centerSlotId_fkey" FOREIGN KEY ("centerSlotId") REFERENCES "CenterSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
