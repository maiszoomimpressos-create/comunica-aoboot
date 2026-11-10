-- Catálogo global de funções mantido pelo Super Admin (/admin/whatsapp) —
-- cards prontos que qualquer tenant pode adotar ao montar as Funções de uma
-- conexão, em vez de descrever do zero pra IA. Ver FunctionTemplate em
-- schema.prisma.
CREATE TABLE "function_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "requiresQr" BOOLEAN NOT NULL DEFAULT false,
    "niches" "SegmentoNiche"[] NOT NULL DEFAULT ARRAY[]::"SegmentoNiche"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "function_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "function_template_key_key" ON "function_template"("key");
