-- CreateTable
CREATE TABLE "OrderCheckup" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "checkupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCheckup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderCheckup_orderId_checkupId_key" ON "OrderCheckup"("orderId", "checkupId");

-- AddForeignKey
ALTER TABLE "OrderCheckup" ADD CONSTRAINT "OrderCheckup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCheckup" ADD CONSTRAINT "OrderCheckup_checkupId_fkey" FOREIGN KEY ("checkupId") REFERENCES "Checkup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
