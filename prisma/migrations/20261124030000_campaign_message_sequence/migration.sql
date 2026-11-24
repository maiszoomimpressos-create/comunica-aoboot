-- Campanhas: sequência de mensagens ("partes") por destinatário.
-- Ver src/lib/campaigns/sequence.ts. Campanhas existentes ficam com
-- parts = NULL e continuam funcionando: o dispatcher deriva a sequência de
-- messageText + mediaType/mediaUrl (partsFromCampaign) — sem migração de
-- dados, nada muda pra elas.

ALTER TABLE "campaign" ADD COLUMN "parts" JSONB;
ALTER TABLE "campaign" ADD COLUMN "minPartIntervalSeconds" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "campaign" ADD COLUMN "maxPartIntervalSeconds" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "campaign_recipient" ADD COLUMN "nextPartIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "campaign_recipient" ADD COLUMN "partMessageIds" JSONB;

-- Destinatários que já receberam a mensagem (formato antigo) contam como
-- sequência concluída — "Reenviar falhas" nunca reenvia o que já saiu.
UPDATE "campaign_recipient" SET "nextPartIndex" = 1
  WHERE "status" IN ('SENT', 'DELIVERED', 'READ');
