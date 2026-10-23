-- Marcador persistente de onde o histórico enviado ao modelo deve começar
-- (ver bot-attendant.service.ts) — substitui o filtro de um turno só que
-- só limpava o contexto na mensagem exata da reabertura, deixando o
-- próximo turno voltar a arrastar pedidos antigos já encerrados.

ALTER TABLE "bot_conversation" ADD COLUMN "contextStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
