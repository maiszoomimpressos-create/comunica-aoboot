-- Log de uso/custo do atendente de IA (uma linha por resposta gerada) pra
-- alimentar a tela de "gastos por conexão" do Super Admin em /admin/whatsapp.
-- Escrita manualmente (prisma migrate indisponível nesta máquina — ver
-- scripts/apply-migrations.mjs) seguindo as convenções das migrations
-- anteriores.

CREATE TABLE "ai_usage_log" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_log_connectionId_createdAt_idx" ON "ai_usage_log"("connectionId", "createdAt");

ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
