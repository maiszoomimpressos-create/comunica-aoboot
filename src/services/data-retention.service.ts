import { deleteBotConversationsCreatedBefore } from "@/repositories/bot.repository";
import { logBotEvent } from "@/lib/logging/bot-attendant-logger";

/** Todo pedido via WhatsApp (conversa + mensagens + eventual transferência
 * pra atendente) deve ser apagado do banco 90 dias depois de criado —
 * decisão do tenant, não condicionada ao status da conversa (mesmo uma
 * ainda ACTIVE passa dos 90 dias é apagada). */
const RETENTION_DAYS = 90;

/** Ticado pelo mesmo pinger externo que já bate em
 * /api/cron/campaign-dispatcher (ver aquele route) — roda a limpeza de
 * retenção de dados do atendente de WhatsApp. Idempotente: rodar de novo
 * no mesmo dia só encontra menos (ou nenhuma) linha vencida. */
export async function deleteExpiredWhatsappRequests(): Promise<{ deletedConversations: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await deleteBotConversationsCreatedBefore(cutoff);

  await logBotEvent("info", "data_retention_cleanup", {
    cutoff: cutoff.toISOString(),
    deletedConversations: count,
  });

  return { deletedConversations: count };
}
