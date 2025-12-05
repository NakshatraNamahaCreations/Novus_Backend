-- AlterTable
ALTER TABLE "Checkup" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
