-- CreateTable
CREATE TABLE "ReportLayout" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "headerImg" TEXT,
    "footerImg" TEXT,
    "alignment" TEXT NOT NULL DEFAULT 'CENTER',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportLayout_pkey" PRIMARY KEY ("id")
);
