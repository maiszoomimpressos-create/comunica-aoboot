-- Trava de idempotência pro atendente de IA: a Z-API manda o webhook de
-- áudio duas vezes pro mesmo messageId (confirmado em produção), fazendo o
-- atendente processar e responder duas vezes. Escrita manualmente (não
-- gerada por `prisma migrate dev`, indisponível nesta máquina — ver
-- scripts/apply-migrations.mjs).

CREATE TABLE "processed_webhook_message" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_webhook_message_connectionId_messageId_key" ON "processed_webhook_message"("connectionId", "messageId");

ALTER TABLE "processed_webhook_message" ADD CONSTRAINT "processed_webhook_message_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
