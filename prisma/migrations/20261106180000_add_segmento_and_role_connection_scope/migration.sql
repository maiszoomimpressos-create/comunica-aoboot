-- Segmento (nicho de negócio declarado pelo tenant, aponta pra uma
-- ChannelConnection — várias podem compartilhar a mesma) e escopo de
-- conexão por Papel (RoleConnectionScope, só lido quando
-- role.connectionScopeEnabled = true). Ver Segmento / Role / RoleConnectionScope
-- em schema.prisma.
CREATE TYPE "SegmentoNiche" AS ENUM ('EVENTOS_INGRESSOS', 'ESTACIONAMENTO', 'MOBILIDADE_CORRIDAS', 'GENERICO_2FA');

-- AlterTable
ALTER TABLE "role" ADD COLUMN "connectionScopeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "segmento" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" "SegmentoNiche" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_connection_scope" (
    "roleId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "role_connection_scope_pkey" PRIMARY KEY ("roleId","connectionId")
);

-- CreateIndex
CREATE INDEX "segmento_tenantId_idx" ON "segmento"("tenantId");

-- CreateIndex
CREATE INDEX "segmento_connectionId_idx" ON "segmento"("connectionId");

-- AddForeignKey
ALTER TABLE "segmento" ADD CONSTRAINT "segmento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmento" ADD CONSTRAINT "segmento_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_connection_scope" ADD CONSTRAINT "role_connection_scope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_connection_scope" ADD CONSTRAINT "role_connection_scope_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
