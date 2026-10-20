-- Atendente de IA no WhatsApp — motor (config por conexão, conversa,
-- histórico de mensagens) + configuração singleton do modelo (Super Admin).
-- Escrita manualmente (não gerada por `prisma migrate dev`, indisponível
-- nesta máquina — ver scripts/apply-migrations.mjs) seguindo exatamente as
-- convenções de nome das migrations anteriores.

CREATE TYPE "BotConversationStatus" AS ENUM ('ACTIVE', 'ESCALATED', 'CLOSED');
CREATE TYPE "BotMessageDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "bot_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "businessProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "bot_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_config_connectionId_key" ON "bot_config"("connectionId");

ALTER TABLE "bot_config" ADD CONSTRAINT "bot_config_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bot_conversation" (
    "id" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "status" "BotConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "bot_conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_conversation_connectionId_contactPhone_key" ON "bot_conversation"("connectionId", "contactPhone");

ALTER TABLE "bot_conversation" ADD CONSTRAINT "bot_conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bot_message" (
    "id" TEXT NOT NULL,
    "direction" "BotMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "bot_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_message_conversationId_createdAt_idx" ON "bot_message"("conversationId", "createdAt");

ALTER TABLE "bot_message" ADD CONSTRAINT "bot_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "bot_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_attendant_settings" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-5.5',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_attendant_settings_pkey" PRIMARY KEY ("id")
);
