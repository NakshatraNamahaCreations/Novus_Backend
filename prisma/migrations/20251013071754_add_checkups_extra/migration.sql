-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "noOfParameter" TEXT,
ADD COLUMN     "reportUnit" TEXT NOT NULL DEFAULT 'hours',
ADD COLUMN     "reportWithin" INTEGER;
