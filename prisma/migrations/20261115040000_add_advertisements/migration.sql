-- Publicidades (WhatsApp > Publicidades): ver Advertisement e
-- AdvertisementDelivery em schema.prisma e advertisement-dispatch.service.ts.
-- Só cria tabelas novas; não altera nenhuma tabela existente.
-- Aplicada em produção com backup prévio em backups/ (aprovado em 15/11/2026).
CREATE TABLE "advertisement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "messageText" TEXT NOT NULL,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "triggerTypeKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequencyMode" TEXT NOT NULL DEFAULT 'PER_DAY',
    "frequencyValue" INTEGER NOT NULL DEFAULT 1,
    "deleteAfterHours" INTEGER,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "advertisement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advertisement_delivery" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "notificationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "deleteAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
    "deleteError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "advertisementId" TEXT NOT NULL,

    CONSTRAINT "advertisement_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advertisement_connectionId_active_idx" ON "advertisement"("connectionId", "active");
CREATE INDEX "advertisement_tenantId_idx" ON "advertisement"("tenantId");
CREATE INDEX "advertisement_delivery_advertisementId_createdAt_idx" ON "advertisement_delivery"("advertisementId", "createdAt");
CREATE INDEX "advertisement_delivery_connectionId_contactKey_createdAt_idx" ON "advertisement_delivery"("connectionId", "contactKey", "createdAt");
CREATE INDEX "advertisement_delivery_deleteAt_idx" ON "advertisement_delivery"("deleteAt");

-- AddForeignKey
ALTER TABLE "advertisement" ADD CONSTRAINT "advertisement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advertisement" ADD CONSTRAINT "advertisement_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advertisement_delivery" ADD CONSTRAINT "advertisement_delivery_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
