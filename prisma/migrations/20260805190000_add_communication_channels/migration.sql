-- Communication channels: Empresa -> Canal -> Provedor -> Conexão.
-- First real product module (WhatsApp via Z-API) sits on top of this;
-- adding a new provider or a new channel type later is a data change
-- (new ChannelProvider row / new enum value), not a schema rewrite.
--
-- Hand-written and applied via scripts/apply-migrations.mjs instead of
-- `prisma migrate dev` (native schema-engine binary blocked on this
-- machine — see README). Matches exactly what `prisma migrate dev` would
-- generate from prisma/schema.prisma.

-- ============ Enums ============
CREATE TYPE "CommunicationChannelType" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'TELEGRAM');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('PENDING', 'CONNECTING', 'CONNECTED', 'AUTH_ERROR', 'UNAVAILABLE', 'INVALID_TOKEN', 'ERROR');

-- ============ communication_channel ============
CREATE TABLE "communication_channel" (
    "id" TEXT NOT NULL,
    "type" "CommunicationChannelType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "communication_channel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_channel_tenantId_type_key" ON "communication_channel"("tenantId", "type");
ALTER TABLE "communication_channel" ADD CONSTRAINT "communication_channel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ channel_provider ============
CREATE TABLE "channel_provider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "CommunicationChannelType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channel_provider_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_provider_key_key" ON "channel_provider"("key");

-- ============ channel_connection ============
CREATE TABLE "channel_connection" (
    "id" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiTokenCipher" TEXT NOT NULL,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastValidation" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    CONSTRAINT "channel_connection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_connection_tenantId_channelId_idx" ON "channel_connection"("tenantId", "channelId");
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "communication_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "channel_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
