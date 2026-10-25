-- Conexão com a API de dados de um app de negócio externo (MAI Drive) —
-- ver docs/INTEGRACAO-MAIDRIVE.md. NÃO APLICADA em produção ainda — gerada
-- e deixada pronta localmente até o Neomar liberar (ver nota operacional
-- no doc acima). Escrita manualmente, mesma convenção das migrations
-- anteriores (prisma migrate indisponível nesta máquina).

CREATE TABLE "business_integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKeyCipher" TEXT NOT NULL,
    "catalogJson" JSONB,
    "catalogFetchedAt" TIMESTAMP(3),
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "business_integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_integration_connectionId_key" ON "business_integration"("connectionId");

ALTER TABLE "business_integration" ADD CONSTRAINT "business_integration_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
