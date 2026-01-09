-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "centerSlotId" INTEGER;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_centerSlotId_fkey" FOREIGN KEY ("centerSlotId") REFERENCES "CenterSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
