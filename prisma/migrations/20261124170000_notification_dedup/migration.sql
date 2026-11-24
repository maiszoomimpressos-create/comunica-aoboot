-- Trava contra recibo repetido (Mai Drive chama 2x a mesma corrida). Aditivo.
-- CreateTable
CREATE TABLE "notification_dedup" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_dedup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_dedup_createdAt_idx" ON "notification_dedup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedup_connectionId_dedupKey_key" ON "notification_dedup"("connectionId", "dedupKey");

