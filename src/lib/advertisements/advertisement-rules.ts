import { isHttpUrl, MAX_LINK_BUTTON_LABEL } from "@/lib/notifications/custom-link-buttons";
import {
  MAX_IMAGE_CAPTION_LENGTH,
  planMessageDeliveries,
  type MessageDeliveryPlan,
  type ResolvedMessageBlock,
} from "@/lib/notifications/message-blocks";

/**
 * Regras puras das Publicidades (sem banco, sem rede) — usadas no disparo
 * (advertisement-dispatch.service.ts), na tela e nos testes.
 */

export type AdvertisementFrequencyMode = "PER_DAY" | "EVERY_N_SENDS";

export interface AdvertisementRuleInput {
  id: string;
  name: string;
  imageUrl: string | null;
  messageText: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  triggerTypeKeys: string[];
  frequencyMode: string;
  frequencyValue: number;
  deleteAfterHours: number | null;
  lastSentAt: Date | null;
  createdAt: Date;
}

/** O WhatsApp só deixa "apagar para todos" por cerca de 2 dias depois do
 * envio; "2 dias" usa 47h para sobrar margem para o cron. Não há mensagem
 * temporária individual na Z-API (só a conversa inteira), por isso apagamos
 * nós mesmos. */
export const DELETE_AFTER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Não apagar" },
  { value: 24, label: "24 horas" },
  { value: 47, label: "2 dias" },
];
export const ALLOWED_DELETE_AFTER_HOURS = [24, 47];
/** Depois disso o WhatsApp não aceita mais "apagar para todos". */
export const WHATSAPP_DELETE_WINDOW_HOURS = 48;

export const FREQUENCY_MODE_LABELS: Record<AdvertisementFrequencyMode, string> = {
  PER_DAY: "No máximo por dia",
  EVERY_N_SENDS: "Uma a cada N envios",
};
export const MAX_FREQUENCY_VALUE = 20;
export const MAX_AD_TEXT_LENGTH = MAX_IMAGE_CAPTION_LENGTH;
/** Espera depois do recibo antes de mandar a publicidade. */
export const ADVERTISEMENT_DELAY_MS = 8_000;

export function normalizeFrequencyMode(value: string): AdvertisementFrequencyMode {
  return value === "EVERY_N_SENDS" ? "EVERY_N_SENDS" : "PER_DAY";
}

export function clampFrequencyValue(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_FREQUENCY_VALUE, Math.max(1, Math.round(value)));
}

/** Ativa e dentro do período agora. */
export function isAdvertisementLive(ad: Pick<AdvertisementRuleInput, "active" | "startsAt" | "endsAt">, now: Date): boolean {
  if (!ad.active) return false;
  if (ad.startsAt && ad.startsAt.getTime() > now.getTime()) return false;
  if (ad.endsAt && ad.endsAt.getTime() < now.getTime()) return false;
  return true;
}

/** Histórico do destinatário nesta conexão (todas as publicidades). */
export interface RecipientAdHistory {
  /** Publicidades enviadas com sucesso nas últimas 24h. */
  adsLast24h: number;
  /** Envios de função com sucesso para ele desde a última publicidade
   * (incluindo o envio de agora). */
  sendsSinceLastAd: number;
}

export function frequencyAllows(ad: Pick<AdvertisementRuleInput, "frequencyMode" | "frequencyValue">, history: RecipientAdHistory): boolean {
  const n = clampFrequencyValue(ad.frequencyValue);
  if (normalizeFrequencyMode(ad.frequencyMode) === "EVERY_N_SENDS") {
    return history.sendsSinceLastAd >= n;
  }
  return history.adsLast24h < n;
}

export type AdvertisementSelection =
  | { ad: AdvertisementRuleInput; reason: "selected" }
  | { ad: null; reason: "nenhuma_ativa" | "limite_frequencia" };

/**
 * Escolhe UMA publicidade para este envio: ativas, no período, ligadas a
 * esta função e liberadas pelo limite de frequência. Rodízio: a que saiu
 * há mais tempo (ou nunca saiu) vai primeiro; empate = a mais antiga.
 */
export function selectAdvertisement(
  ads: AdvertisementRuleInput[],
  ctx: { notificationType: string; now: Date; history: RecipientAdHistory }
): AdvertisementSelection {
  const live = ads.filter((ad) => isAdvertisementLive(ad, ctx.now) && ad.triggerTypeKeys.includes(ctx.notificationType));
  if (live.length === 0) return { ad: null, reason: "nenhuma_ativa" };
  const allowed = live.filter((ad) => frequencyAllows(ad, ctx.history));
  if (allowed.length === 0) return { ad: null, reason: "limite_frequencia" };
  const sorted = [...allowed].sort((a, b) => {
    const at = a.lastSentAt?.getTime() ?? -Infinity;
    const bt = b.lastSentAt?.getTime() ?? -Infinity;
    if (at !== bt) return at < bt ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return { ad: sorted[0], reason: "selected" };
}

/**
 * Botão de link nas Publicidades. DESLIGADO: a Z-API aceita
 * send-button-actions (HTTP 200) mas a mensagem não chega no passageiro.
 * Enquanto estiver false, nenhuma publicidade usa send-button-actions: sai
 * como imagem com legenda (send-image) ou texto (send-text); o link vai no
 * próprio texto.
 */
export const ADVERTISEMENT_BUTTONS_ENABLED = false;

/** Banner em cima e texto embaixo — chega num balão só (imagem com legenda). */
export function planAdvertisementMessage(
  ad: Pick<AdvertisementRuleInput, "imageUrl" | "messageText" | "buttonLabel" | "buttonUrl">
): MessageDeliveryPlan {
  const blocks: ResolvedMessageBlock[] = [];
  const hasButton = !!(ad.buttonLabel?.trim() && ad.buttonUrl && isHttpUrl(ad.buttonUrl));
  let text = ad.messageText;
  // Botão desligado: se algum anúncio antigo tiver botão, o link vai no texto.
  if (hasButton && !ADVERTISEMENT_BUTTONS_ENABLED && !text.includes(ad.buttonUrl!)) {
    text = `${text.trim()}\n\n👉 ${ad.buttonLabel!.trim()}: ${ad.buttonUrl}`.trim();
  }
  if (ad.imageUrl && isHttpUrl(ad.imageUrl)) blocks.push({ id: "banner", type: "imagem", image: ad.imageUrl });
  if (text.trim()) blocks.push({ id: "texto", type: "texto", text });
  if (hasButton && ADVERTISEMENT_BUTTONS_ENABLED) {
    blocks.push({ id: "botao", type: "botoes", buttons: [{ id: "1", label: ad.buttonLabel!.trim(), url: ad.buttonUrl! }] });
  }
  const plan = planMessageDeliveries(blocks);
  if (ADVERTISEMENT_BUTTONS_ENABLED) return plan;
  // Garantia extra: nada de send-button-actions com o botão desligado.
  return {
    ...plan,
    deliveries: plan.deliveries.map((d) =>
      d.kind === "buttons" || d.buttons
        ? { kind: d.image ? ("image" as const) : ("text" as const), text: d.text, image: d.image, blockIds: d.blockIds }
        : d
    ),
  };
}

export function computeDeleteAt(sentAt: Date, deleteAfterHours: number | null): Date | null {
  if (!deleteAfterHours || !ALLOWED_DELETE_AFTER_HOURS.includes(deleteAfterHours)) return null;
  return new Date(sentAt.getTime() + deleteAfterHours * 3_600_000);
}

export interface AdvertisementFormInput {
  name: string;
  imageUrl: string | null;
  messageText: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  triggerTypeKeys: string[];
  frequencyMode: string;
  frequencyValue: number;
  deleteAfterHours: number | null;
}

/** Erros para o usuário comum (vazio = pode salvar). */
export function validateAdvertisementInput(input: AdvertisementFormInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Dê um nome para a publicidade.");
  if (!input.messageText.trim() && !input.imageUrl) errors.push("Coloque um banner ou um texto.");
  if (input.messageText.length > MAX_AD_TEXT_LENGTH) {
    errors.push(`O texto pode ter no máximo ${MAX_AD_TEXT_LENGTH} caracteres.`);
  }
  if (input.imageUrl && !isHttpUrl(input.imageUrl)) errors.push("O link do banner precisa começar com https://.");
  const hasLabel = ADVERTISEMENT_BUTTONS_ENABLED && !!input.buttonLabel?.trim();
  const hasUrl = ADVERTISEMENT_BUTTONS_ENABLED && !!input.buttonUrl?.trim();
  if (hasLabel !== hasUrl) errors.push("O botão precisa de nome e link (ou deixe os dois vazios).");
  if (hasLabel && input.buttonLabel!.trim().length > MAX_LINK_BUTTON_LABEL) {
    errors.push(`O nome do botão pode ter no máximo ${MAX_LINK_BUTTON_LABEL} letras.`);
  }
  if (hasUrl && !isHttpUrl(input.buttonUrl!.trim())) errors.push("O link do botão precisa começar com https://.");
  if (hasLabel && !input.messageText.trim()) errors.push("Para ter botão, escreva um texto (o WhatsApp exige).");
  if (input.startsAt && input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) {
    errors.push("O fim do período precisa ser depois do início.");
  }
  if (input.triggerTypeKeys.length === 0) errors.push("Escolha depois de qual função a publicidade vai.");
  if (input.deleteAfterHours !== null && !ALLOWED_DELETE_AFTER_HOURS.includes(input.deleteAfterHours)) {
    errors.push("Escolha uma opção válida em \"Apagar depois de\".");
  }
  if (!Number.isFinite(input.frequencyValue) || input.frequencyValue < 1 || input.frequencyValue > MAX_FREQUENCY_VALUE) {
    errors.push(`O limite precisa ser um número de 1 a ${MAX_FREQUENCY_VALUE}.`);
  }
  return errors;
}

/** Erro de tabela inexistente (migration ainda não aplicada). */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "P2021" || e.code === "42P01") return true;
  return typeof e.message === "string" && /does not exist|não existe/i.test(e.message) && /advertisement/i.test(e.message);
}
