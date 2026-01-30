/*
  Warnings:

  - You are about to drop the column `count` on the `CenterSlotBooking` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `CenterSlotBooking` table. All the data in the column will be lost.
  - You are about to drop the column `slotId` on the `CenterSlotBooking` table. All the data in the column will be lost.
  - Added the required column `centerId` to the `CenterSlotBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `centerSlotId` to the `CenterSlotBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotDate` to the `CenterSlotBooking` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CenterSlotBooking" DROP CONSTRAINT "CenterSlotBooking_slotId_fkey";

-- DropIndex
DROP INDEX "CenterSlotBooking_slotId_date_key";

-- AlterTable
ALTER TABLE "CenterSlotBooking" DROP COLUMN "count",
DROP COLUMN "date",
DROP COLUMN "slotId",
ADD COLUMN     "centerId" INTEGER NOT NULL,
ADD COLUMN     "centerSlotId" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "slotDate" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "CenterSlotBooking" ADD CONSTRAINT "CenterSlotBooking_centerSlotId_fkey" FOREIGN KEY ("centerSlotId") REFERENCES "CenterSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
