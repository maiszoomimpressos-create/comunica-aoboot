-- Pós-corrida: imagem com o link do app na Play Store, agendada 3-5 min
-- depois do recibo `corrida_concluida`. Ver AppPromoSettings e
-- RideReceiptFollowUp em schema.prisma.

-- CreateEnum
CREATE TYPE "RideReceiptFollowUpStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "app_promo_settings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "playStoreUrl" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "app_promo_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_receipt_follow_up" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "status" "RideReceiptFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "receiptMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "ride_receipt_follow_up_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_promo_settings_connectionId_key" ON "app_promo_settings"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ride_receipt_follow_up_idempotencyKey_key" ON "ride_receipt_follow_up"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ride_receipt_follow_up_status_scheduledAt_idx" ON "ride_receipt_follow_up"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ride_receipt_follow_up_connectionId_createdAt_idx" ON "ride_receipt_follow_up"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "app_promo_settings" ADD CONSTRAINT "app_promo_settings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_receipt_follow_up" ADD CONSTRAINT "ride_receipt_follow_up_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
