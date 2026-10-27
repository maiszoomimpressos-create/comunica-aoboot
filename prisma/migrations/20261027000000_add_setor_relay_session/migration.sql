-- Setores (departamentos configurados pelo tenant), pool de atendentes por
-- setor, e sessão de relay (broadcast -> claim -> relay bidirecional) usada
-- pelo handoff "escalarParaHumano". Escrita manualmente (não gerada por
-- `prisma migrate dev`, indisponível nesta máquina — ver
-- scripts/apply-migrations.mjs) seguindo exatamente as convenções de nome
-- das migrations anteriores.

CREATE TYPE "RelaySessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CLOSED');

CREATE TABLE "setor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "noClaimTimeoutMinutes" INTEGER,
    "inactivityTimeoutMinutes" INTEGER,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "setor_connectionId_name_key" ON "setor"("connectionId", "name");

CREATE INDEX "setor_tenantId_idx" ON "setor"("tenantId");

ALTER TABLE "setor" ADD CONSTRAINT "setor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "setor" ADD CONSTRAINT "setor_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "setor_attendant" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setorId" TEXT NOT NULL,

    CONSTRAINT "setor_attendant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "setor_attendant_setorId_phone_key" ON "setor_attendant"("setorId", "phone");

ALTER TABLE "setor_attendant" ADD CONSTRAINT "setor_attendant_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "relay_session" (
    "id" TEXT NOT NULL,
    "status" "RelaySessionStatus" NOT NULL DEFAULT 'PENDING',
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "claimedByPhone" TEXT,
    "broadcastedTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "relay_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relay_session_code_key" ON "relay_session"("code");

CREATE INDEX "relay_session_connectionId_customerPhone_status_idx" ON "relay_session"("connectionId", "customerPhone", "status");

CREATE INDEX "relay_session_connectionId_claimedByPhone_status_idx" ON "relay_session"("connectionId", "claimedByPhone", "status");

CREATE INDEX "relay_session_connectionId_setorId_status_idx" ON "relay_session"("connectionId", "setorId", "status");

ALTER TABLE "relay_session" ADD CONSTRAINT "relay_session_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relay_session" ADD CONSTRAINT "relay_session_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relay_session" ADD CONSTRAINT "relay_session_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "bot_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "relay_session_claim" (
    "id" TEXT NOT NULL,
    "relaySessionId" TEXT NOT NULL,
    "attendantPhone" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relay_session_claim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relay_session_claim_relaySessionId_key" ON "relay_session_claim"("relaySessionId");

ALTER TABLE "relay_session_claim" ADD CONSTRAINT "relay_session_claim_relaySessionId_fkey" FOREIGN KEY ("relaySessionId") REFERENCES "relay_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
