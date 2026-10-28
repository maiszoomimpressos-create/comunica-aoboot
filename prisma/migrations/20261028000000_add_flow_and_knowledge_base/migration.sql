-- Flow Builder (fluxo conversacional visual, DRAFT/PUBLISHED por conexão,
-- execução por contato) e Base de Conhecimento (fichas que alimentam o
-- atendente de IA + fila de correções apontadas pelo tenant). Escrita
-- manualmente (schema-engine indisponível nesta máquina — ver
-- scripts/apply-migrations.mjs) seguindo exatamente as convenções de nome
-- das migrations anteriores.

CREATE TYPE "FlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FlowStatus" NOT NULL DEFAULT 'DRAFT',
    "draftGraph" JSONB NOT NULL,
    "publishedGraph" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "flow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "flow_connectionId_status_idx" ON "flow"("connectionId", "status");

ALTER TABLE "flow" ADD CONSTRAINT "flow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "FlowSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

CREATE TABLE "flow_session" (
    "id" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" "FlowSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "flowId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,

    CONSTRAINT "flow_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flow_session_connectionId_contactPhone_key" ON "flow_session"("connectionId", "contactPhone");

ALTER TABLE "flow_session" ADD CONSTRAINT "flow_session_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flow_session" ADD CONSTRAINT "flow_session_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "KnowledgeEntrySource" AS ENUM ('MANUAL', 'CORRECTION');

CREATE TABLE "knowledge_entry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "KnowledgeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "knowledge_entry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_entry_connectionId_active_idx" ON "knowledge_entry"("connectionId", "active");

ALTER TABLE "knowledge_entry" ADD CONSTRAINT "knowledge_entry_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "KnowledgeCorrectionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

CREATE TABLE "knowledge_correction" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT,
    "question" TEXT NOT NULL,
    "wrongAnswer" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "status" "KnowledgeCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "connectionId" TEXT NOT NULL,
    "resultingEntryId" TEXT,

    CONSTRAINT "knowledge_correction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_correction_connectionId_status_idx" ON "knowledge_correction"("connectionId", "status");

ALTER TABLE "knowledge_correction" ADD CONSTRAINT "knowledge_correction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_correction" ADD CONSTRAINT "knowledge_correction_resultingEntryId_fkey" FOREIGN KEY ("resultingEntryId") REFERENCES "knowledge_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
