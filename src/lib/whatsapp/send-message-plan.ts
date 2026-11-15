import type { WhatsappProvider } from "./provider";
import type { SendMessageResult, WhatsappConnectionConfig } from "./types";
import type { MessageDelivery } from "@/lib/notifications/message-blocks";

export type PlanItemVia = "text" | "image" | "buttons" | "text_fallback" | "image_fallback";

export interface PlanItemResult extends SendMessageResult {
  kind: MessageDelivery["kind"];
  via: PlanItemVia;
  buttonsError?: string;
}

export interface SendMessagePlanResult extends SendMessageResult {
  items: PlanItemResult[];
  /** Quantas mensagens do plano saíram com sucesso. */
  sentCount: number;
}

/** messageId da resposta da Z-API (send-text/send-image/...), ou null. */
export function extractMessageId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row.messageId ?? row.id ?? row.zaapId;
  return typeof id === "string" && id ? id : null;
}

/** messageIds de cada mensagem que saiu (para "Apagar depois de"). */
export function messageIdsFromPlanResult(result: SendMessagePlanResult): string[] {
  return result.items.filter((i) => i.ok).map((i) => extractMessageId(i.raw)).filter((id): id is string => !!id);
}

async function sendOne(
  provider: WhatsappProvider,
  config: WhatsappConnectionConfig,
  to: string,
  delivery: MessageDelivery
): Promise<PlanItemResult> {
  if (delivery.kind === "buttons" && delivery.buttons && delivery.buttons.length > 0 && provider.sendLinkButtons) {
    const text = delivery.text ?? "";
    const withButtons = await provider.sendLinkButtons(config, to, text, delivery.buttons, delivery.image ? { image: delivery.image } : undefined);
    const base = { ok: withButtons.ok, message: withButtons.message, raw: withButtons.raw };
    if (withButtons.ok) return { ...base, kind: delivery.kind, via: "buttons" };
    // Só reenvia sem botões quando a Z-API recusou (HTTP); timeout pode ter
    // entregue, e reenviar duplicaria a mensagem para o passageiro.
    if (!withButtons.fallbackSafe) return { ...base, kind: delivery.kind, via: "buttons", buttonsError: withButtons.message };
    const plain = delivery.image
      ? await provider.sendImage(config, to, delivery.image, text)
      : await provider.sendMessage(config, to, text);
    return { ...plain, kind: delivery.kind, via: delivery.image ? "image_fallback" : "text_fallback", buttonsError: withButtons.message };
  }
  if (delivery.kind === "image" && delivery.image) {
    return { ...(await provider.sendImage(config, to, delivery.image, delivery.text)), kind: delivery.kind, via: "image" };
  }
  // Botões sem suporte no provedor: texto puro (os links estão no texto).
  if (delivery.image) {
    return { ...(await provider.sendImage(config, to, delivery.image, delivery.text)), kind: delivery.kind, via: "image" };
  }
  return { ...(await provider.sendMessage(config, to, delivery.text ?? "")), kind: delivery.kind, via: "text" };
}

/**
 * Envia as mensagens do plano em sequência, na ordem. Para no primeiro erro
 * (não manda o resto fora de ordem). O resultado geral é ok quando a
 * mensagem com o texto principal (`mainIndex`) saiu — assim o sistema de
 * fora não reenvia o recibo inteiro por causa de uma imagem extra.
 */
export async function sendMessagePlan(
  provider: WhatsappProvider,
  config: WhatsappConnectionConfig,
  to: string,
  deliveries: MessageDelivery[],
  mainIndex = 0
): Promise<SendMessagePlanResult> {
  const items: PlanItemResult[] = [];
  for (const delivery of deliveries) {
    let item: PlanItemResult;
    try {
      item = await sendOne(provider, config, to, delivery);
    } catch (err) {
      item = { ok: false, message: err instanceof Error ? err.message : "Falha ao enviar.", kind: delivery.kind, via: "text" };
    }
    items.push(item);
    if (!item.ok) break;
  }
  const sentCount = items.filter((i) => i.ok).length;
  if (deliveries.length === 0) {
    return { ok: false, message: "Nada para enviar.", items, sentCount };
  }
  const main = items[Math.min(Math.max(mainIndex, 0), deliveries.length - 1)];
  const allOk = sentCount === deliveries.length;
  if (allOk) {
    return { ok: true, message: main?.message ?? "Mensagem enviada com sucesso.", raw: main?.raw, items, sentCount };
  }
  if (main?.ok) {
    return {
      ok: true,
      message: `Mensagem principal enviada; ${deliveries.length - sentCount} parte(s) não saíram.`,
      raw: main.raw,
      items,
      sentCount,
    };
  }
  const failed = items[items.length - 1];
  return { ok: false, message: failed?.message ?? "Falha ao enviar.", raw: failed?.raw, items, sentCount };
}
