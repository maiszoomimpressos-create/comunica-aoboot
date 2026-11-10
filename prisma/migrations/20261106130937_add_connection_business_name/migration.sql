-- Nome exibido nas mensagens automáticas desta conexão — sobrepõe
-- Organization.messageBusinessName quando preenchido (ver whatsapp-connection.service.ts).
ALTER TABLE "channel_connection" ADD COLUMN "businessName" TEXT;
