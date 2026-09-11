-- Campanhas — disparo em massa de WhatsApp (fila persistente).
-- Escrita manualmente (não gerada por `prisma migrate dev`, indisponível
-- nesta máquina — ver scripts/apply-migrations.mjs) seguindo exatamente as
-- convenções de nome das migrations anteriores.

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'OPTED_OUT');

CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sync',
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "optedOutSource" TEXT,
    "consentStatus" TEXT NOT NULL DEFAULT 'declared',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_connectionId_phone_key" ON "contact"("connectionId", "phone");
CREATE INDEX "contact_tenantId_idx" ON "contact"("tenantId");

ALTER TABLE "contact" ADD CONSTRAINT "contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact" ADD CONSTRAINT "contact_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contact_list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "contact_list_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_list_tenantId_connectionId_idx" ON "contact_list"("tenantId", "connectionId");

ALTER TABLE "contact_list" ADD CONSTRAINT "contact_list_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_list" ADD CONSTRAINT "contact_list_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contact_list_member" (
    "id" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "contact_list_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_list_member_listId_contactId_key" ON "contact_list_member"("listId", "contactId");

ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_listId_fkey" FOREIGN KEY ("listId") REFERENCES "contact_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "batchSize" INTEGER,
    "minMessageIntervalSeconds" INTEGER,
    "maxMessageIntervalSeconds" INTEGER,
    "minBatchPauseSeconds" INTEGER,
    "maxBatchPauseSeconds" INTEGER,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaign_tenantId_connectionId_idx" ON "campaign"("tenantId", "connectionId");
CREATE INDEX "campaign_connectionId_status_idx" ON "campaign"("connectionId", "status");

ALTER TABLE "campaign" ADD CONSTRAINT "campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "contact_list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "campaign_recipient" (
    "id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "lockedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "campaign_recipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_recipient_campaignId_contactId_key" ON "campaign_recipient"("campaignId", "contactId");
CREATE INDEX "campaign_recipient_campaignId_status_idx" ON "campaign_recipient"("campaignId", "status");

ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "connection_campaign_settings" (
    "id" TEXT NOT NULL,
    "sendWindowStart" TEXT NOT NULL DEFAULT '07:30',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '19:30',
    "batchSize" INTEGER NOT NULL DEFAULT 5,
    "minMessageIntervalSeconds" INTEGER NOT NULL DEFAULT 12,
    "maxMessageIntervalSeconds" INTEGER NOT NULL DEFAULT 18,
    "minBatchPauseSeconds" INTEGER NOT NULL DEFAULT 15,
    "maxBatchPauseSeconds" INTEGER NOT NULL DEFAULT 20,
    "dailyLimit" INTEGER,
    "dailySentCount" INTEGER NOT NULL DEFAULT 0,
    "dailySentDate" TIMESTAMP(3),
    "maxConsecutiveErrors" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "connection_campaign_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connection_campaign_settings_connectionId_key" ON "connection_campaign_settings"("connectionId");

ALTER TABLE "connection_campaign_settings" ADD CONSTRAINT "connection_campaign_settings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
