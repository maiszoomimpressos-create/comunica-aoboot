-- Segredo próprio da conexão pra autenticar webhooks recebidos da Z-API.
ALTER TABLE "channel_connection" ADD COLUMN "webhookSecret" TEXT;

-- Log bruto dos eventos recebidos via webhook.
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_event_connectionId_receivedAt_idx" ON "webhook_event"("connectionId", "receivedAt");

ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
