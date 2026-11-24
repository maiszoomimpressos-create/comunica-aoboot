-- Campanhas prontas pra produção: claim atômico com token, trava por
-- conexão, ritmo real entre mensagens, aquecimento, opt-out por empresa,
-- status de entrega (messageId), agendamento de início, documento/áudio.
-- Escrita à mão (ver scripts/apply-migrations.mjs) e conferida com
-- `prisma migrate diff --from-schema <schema antigo> --to-schema prisma/schema.prisma`.

-- Campaign
ALTER TABLE "campaign" ADD COLUMN "mediaFileName" TEXT;
ALTER TABLE "campaign" ADD COLUMN "scheduledStartAt" TIMESTAMP(3);

-- CampaignRecipient
ALTER TABLE "campaign_recipient" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "campaign_recipient" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "campaign_recipient" ADD COLUMN "providerMessageId" TEXT;

CREATE INDEX "campaign_recipient_campaignId_status_scheduledAt_idx" ON "campaign_recipient"("campaignId", "status", "scheduledAt");
CREATE INDEX "campaign_recipient_providerMessageId_idx" ON "campaign_recipient"("providerMessageId");

-- ConnectionCampaignSettings
ALTER TABLE "connection_campaign_settings" ALTER COLUMN "dailyLimit" SET DEFAULT 200;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "campaignsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "warmupEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "warmupStartedAt" TIMESTAMP(3);
ALTER TABLE "connection_campaign_settings" ADD COLUMN "verifyNumbersBeforeSend" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "optOutFooterEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "optOutFooterText" TEXT;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "lastSentAt" TIMESTAMP(3);
ALTER TABLE "connection_campaign_settings" ADD COLUMN "dispatchLockToken" TEXT;
ALTER TABLE "connection_campaign_settings" ADD COLUMN "dispatchLockedUntil" TIMESTAMP(3);

-- Conexões que já tinham configuração nasceram com "sem limite" porque
-- esse era o default antigo (não uma escolha do tenant) — passam a ter o
-- teto padrão de 200/dia. O tenant pode limpar o campo de novo no painel.
UPDATE "connection_campaign_settings" SET "dailyLimit" = 200 WHERE "dailyLimit" IS NULL;

-- Conexões que já disparam campanha não são "números novos": o
-- aquecimento começa marcado como concluído pra elas (warmupStartedAt
-- bem no passado), só números que nunca enviaram passam pela rampa.
UPDATE "connection_campaign_settings" s
  SET "warmupStartedAt" = TIMESTAMP '2000-01-01 00:00:00'
  WHERE EXISTS (
    SELECT 1 FROM "campaign_recipient" r
    JOIN "campaign" c ON c."id" = r."campaignId"
    WHERE c."connectionId" = s."connectionId" AND r."sentAt" IS NOT NULL
  );

-- Opt-out por empresa
CREATE TABLE "tenant_opt_out" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "tenant_opt_out_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_opt_out_tenantId_phone_key" ON "tenant_opt_out"("tenantId", "phone");

ALTER TABLE "tenant_opt_out" ADD CONSTRAINT "tenant_opt_out_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opt-outs já registrados por contato viram opt-out da empresa. A chave
-- de telefone é só dígitos com o 9º dígito BR restaurado (mesma regra de
-- normalizeBrazilianMobile): 55 + DDD + 8 dígitos -> 55 + DDD + 9 + 8.
INSERT INTO "tenant_opt_out" ("id", "phone", "source", "createdAt", "tenantId")
SELECT DISTINCT ON (c."tenantId", k.phone_key)
  'optout_' || md5(c."tenantId" || ':' || k.phone_key),
  k.phone_key,
  COALESCE(c."optedOutSource", 'manual'),
  COALESCE(c."optedOutAt", CURRENT_TIMESTAMP),
  c."tenantId"
FROM "contact" c
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN length(regexp_replace(c."phone", '\D', '', 'g')) = 12 AND regexp_replace(c."phone", '\D', '', 'g') LIKE '55%'
      THEN substr(regexp_replace(c."phone", '\D', '', 'g'), 1, 4) || '9' || substr(regexp_replace(c."phone", '\D', '', 'g'), 5)
    ELSE regexp_replace(c."phone", '\D', '', 'g')
  END AS phone_key
) k
WHERE c."optedOut" = true
ON CONFLICT ("tenantId", "phone") DO NOTHING;
