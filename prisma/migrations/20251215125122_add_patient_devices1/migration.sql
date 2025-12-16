/*
  Warnings:

  - Made the column `patientId` on table `notification_logs` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_patientId_fkey";

-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN     "email" TEXT,
ADD COLUMN     "isResend" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isResend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalNotificationId" INTEGER,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "resendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segmentCriteria" JSONB;

-- CreateIndex
CREATE INDEX "notification_logs_notificationId_idx" ON "notification_logs"("notificationId");

-- CreateIndex
CREATE INDEX "notification_logs_patientId_idx" ON "notification_logs"("patientId");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE INDEX "notification_logs_sentAt_idx" ON "notification_logs"("sentAt");

-- CreateIndex
CREATE INDEX "notification_logs_type_idx" ON "notification_logs"("type");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_scheduledAt_idx" ON "notifications"("scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_sentAt_idx" ON "notifications"("sentAt");

-- CreateIndex
CREATE INDEX "notifications_createdById_idx" ON "notifications"("createdById");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_audience_idx" ON "notifications"("audience");

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
