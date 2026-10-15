-- Lista extraída de um grupo específico do WhatsApp (em vez da agenda
-- inteira do número) — null mantém o comportamento atual.
ALTER TABLE "contact_list" ADD COLUMN "sourceGroupId" TEXT;

-- No máximo uma lista por grupo por conexão (NULLs não colidem entre si no
-- Postgres, então isso não afeta as listas com sourceGroupId nulo).
CREATE UNIQUE INDEX "contact_list_connectionId_sourceGroupId_key" ON "contact_list"("connectionId", "sourceGroupId");
