import type { CampaignListRow, CampaignRecipientRow, RecipientCounts } from "@/repositories/campaign.repository";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignListRow["status"], string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em andamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const CAMPAIGN_STATUS_VARIANT: Record<CampaignListRow["status"], BadgeVariant> = {
  DRAFT: "outline",
  SCHEDULED: "outline",
  RUNNING: "default",
  PAUSED: "secondary",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

export const RECIPIENT_STATUS_LABEL: Record<CampaignRecipientRow["status"], string> = {
  PENDING: "Pendente",
  PROCESSING: "Enviando",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
  INVALID_NUMBER: "Sem WhatsApp",
  CANCELLED: "Cancelada",
  OPTED_OUT: "Opt-out",
};

export const RECIPIENT_STATUS_VARIANT: Record<CampaignRecipientRow["status"], BadgeVariant> = {
  PENDING: "outline",
  PROCESSING: "outline",
  SENT: "default",
  DELIVERED: "default",
  READ: "default",
  FAILED: "destructive",
  INVALID_NUMBER: "destructive",
  CANCELLED: "secondary",
  OPTED_OUT: "secondary",
};

/** Datas sempre no fuso de São Paulo — server components rodam em UTC na
 * Vercel, então `toLocaleString` sem timeZone mostraria 3 h a mais. */
export function formatSpDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface CampaignMetrics {
  /** Saiu pela Z-API (enviada + entregue + lida). */
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  invalid: number;
  optedOut: number;
  cancelled: number;
  pending: number;
  total: number;
  /** Destinatários já resolvidos (qualquer estado final). */
  done: number;
}

export function computeMetrics(counts: RecipientCounts, total: number): CampaignMetrics {
  const c = (k: keyof RecipientCounts) => counts[k] ?? 0;
  const read = c("READ");
  const delivered = c("DELIVERED") + read;
  const sent = c("SENT") + delivered;
  const pending = c("PENDING") + c("PROCESSING");
  return {
    sent,
    delivered,
    read,
    failed: c("FAILED"),
    invalid: c("INVALID_NUMBER"),
    optedOut: c("OPTED_OUT"),
    cancelled: c("CANCELLED"),
    pending,
    total,
    done: total - pending,
  };
}
