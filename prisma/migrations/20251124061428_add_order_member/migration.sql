/*
  Warnings:

  - You are about to drop the `OrderPackage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrderPackage" DROP CONSTRAINT "OrderPackage_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPackage" DROP CONSTRAINT "OrderPackage_packageId_fkey";

-- DropTable
DROP TABLE "OrderPackage";

-- CreateTable
CREATE TABLE "OrderMember" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "OrderMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMemberPackage" (
    "id" SERIAL NOT NULL,
    "orderMemberId" INTEGER NOT NULL,
    "packageId" INTEGER NOT NULL,

    CONSTRAINT "OrderMemberPackage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderMember" ADD CONSTRAINT "OrderMember_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_orderMemberId_fkey" FOREIGN KEY ("orderMemberId") REFERENCES "OrderMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMemberPackage" ADD CONSTRAINT "OrderMemberPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
