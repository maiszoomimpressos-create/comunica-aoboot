-- Captação de contatos do Google (Places API) + proteções de contato frio.
-- Ver lib/google-places/*, services/google-capture.service.ts e
-- lib/campaigns/cold-outreach.ts. Só adiciona colunas com default — nada
-- muda pra contatos/campanhas existentes.

ALTER TABLE "contact" ADD COLUMN "isCold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contact" ADD COLUMN "externalId" TEXT;
ALTER TABLE "contact" ADD COLUMN "captureQuery" TEXT;
ALTER TABLE "contact" ADD COLUMN "capturedAt" TIMESTAMP(3);
ALTER TABLE "contact" ADD COLUMN "phoneType" TEXT;

ALTER TABLE "campaign" ADD COLUMN "coldOutreach" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "connection_campaign_settings" ADD COLUMN "coldDailyLimit" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "coldDailySentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "coldMinMessageIntervalSeconds" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "coldMaxMessageIntervalSeconds" INTEGER NOT NULL DEFAULT 120;
