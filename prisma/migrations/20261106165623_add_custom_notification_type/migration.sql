-- Tipo de notificação criado pelo próprio tenant (campos + texto gerados
-- por IA a partir de uma descrição livre) — ver CustomNotificationType em
-- schema.prisma e sendPurchaseConfirmation em whatsapp-connection.service.ts.
CREATE TABLE "custom_notification_type" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "requiresQr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "custom_notification_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_notification_type_connectionId_key_key" ON "custom_notification_type"("connectionId", "key");

-- AddForeignKey
ALTER TABLE "custom_notification_type" ADD CONSTRAINT "custom_notification_type_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
