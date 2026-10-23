-- Catálogo de nichos de negócio do atendente de IA (mobilidade, delivery,
-- ...) + coluna em bot_config apontando pro nicho escolhido pelo tenant.
-- Escrita manualmente (não gerada por `prisma migrate dev`, indisponível
-- nesta máquina — ver scripts/apply-migrations.mjs) seguindo exatamente as
-- convenções de nome das migrations anteriores.

CREATE TABLE "bot_vertical" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "requiresFixedLocation" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_vertical_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_vertical_key_key" ON "bot_vertical"("key");

ALTER TABLE "bot_config" ADD COLUMN "verticalId" TEXT;

ALTER TABLE "bot_config" ADD CONSTRAINT "bot_config_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "bot_vertical"("id") ON DELETE SET NULL ON UPDATE CASCADE;
