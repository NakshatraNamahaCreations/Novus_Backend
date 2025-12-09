-- CreateEnum
CREATE TYPE "Alignment" AS ENUM ('LEFT', 'RIGHT');

-- CreateTable
CREATE TABLE "ESignature" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "qualification" TEXT,
    "designation" TEXT,
    "signatureImg" TEXT NOT NULL,
    "categories" TEXT[],
    "alignment" "Alignment" NOT NULL DEFAULT 'LEFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ESignature_pkey" PRIMARY KEY ("id")
);
