-- Resumo do pedido em aberto no momento da escalação pra humano, pra IA
-- poder perguntar "isso já foi atendido?" quando o cliente escrever de
-- novo, em vez de simplesmente assumir (ver bot-attendant.service.ts).
-- Escrita manualmente (prisma migrate indisponível nesta máquina — ver
-- scripts/apply-migrations.mjs).

ALTER TABLE "bot_conversation" ADD COLUMN "pendingRequestSummary" TEXT;
