-- Encurtador de link multi-empresa (painel > Links curtos; público em /l/<slug>)
-- + link curto no convite pós-corrida. Aditivo: tabela nova e 2 colunas nulas.
-- AlterTable
ALTER TABLE "app_promo_settings" ADD COLUMN     "shortLinkSlug" TEXT,
ADD COLUMN     "shortLinkUrl" TEXT;

-- CreateTable
CREATE TABLE "short_link" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastClickAt" TIMESTAMP(3),
    "connectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "short_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_link_slug_key" ON "short_link"("slug");

-- CreateIndex
CREATE INDEX "short_link_tenantId_createdAt_idx" ON "short_link"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "short_link" ADD CONSTRAINT "short_link_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

