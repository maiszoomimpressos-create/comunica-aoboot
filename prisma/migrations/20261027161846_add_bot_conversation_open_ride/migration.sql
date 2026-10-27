-- Rastreia a corrida/entrega em acompanhamento de uma conversa (ver
-- openRideId/openRideStatus em BotConversation, schema.prisma) para o
-- stopgap de aviso automático de status enquanto o webhook do MAI Drive
-- não existe.
ALTER TABLE "bot_conversation" ADD COLUMN "openRideId" TEXT;
ALTER TABLE "bot_conversation" ADD COLUMN "openRideStatus" TEXT;
