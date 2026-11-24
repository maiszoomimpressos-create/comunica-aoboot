import { createHash } from "node:crypto";

/**
 * Chave da trava contra recibo repetido (ver NotificationDedup em
 * schema.prisma). Puro, sem banco — testável.
 *
 *  - Chave explícita (header Idempotency-Key, body.idempotencyKey ou
 *    details.id_corrida): vale pra qualquer tipo de mensagem.
 *  - Sem chave explícita: só recibo de corrida usa hash do conteúdo
 *    (tipo + telefone + dados + nota + qr). Outros tipos não são travados
 *    por conteúdo — alertas iguais legítimos (ex.: alerta repetido) seguem saindo.
 */
export const RECEIPT_DEDUP_WINDOW_MS = 30 * 60 * 1000;
/** SENDING mais velho que isso = o 1º envio morreu no meio; outro pode assumir. */
export const RECEIPT_DEDUP_IN_FLIGHT_STALE_MS = 2 * 60 * 1000;
export const EXPLICIT_KEY_MAX_LENGTH = 200;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableDetails(details: Record<string, string> | undefined): string {
  const d = details ?? {};
  return JSON.stringify(
    Object.keys(d)
      .sort()
      .map((k) => [k, (d[k] ?? "").trim()])
  );
}

export interface ReceiptDedupInput {
  type: string;
  to: string;
  details?: Record<string, string>;
  note?: string;
  qrData?: string;
  /** Header Idempotency-Key ou body.idempotencyKey. */
  explicitKey?: string | null;
  isRideReceipt: boolean;
}

export function resolveExplicitDedupKey(input: Pick<ReceiptDedupInput, "explicitKey" | "details">): string | null {
  const raw = input.explicitKey?.trim() || input.details?.id_corrida?.trim() || "";
  if (!raw) return null;
  return raw.slice(0, EXPLICIT_KEY_MAX_LENGTH);
}

export function computeReceiptDedupKey(input: ReceiptDedupInput): string | null {
  const explicit = resolveExplicitDedupKey(input);
  if (explicit) return `id:${sha256(`${input.type}|${explicit}`)}`;
  if (!input.isRideReceipt) return null;
  const phone = input.to.replace(/\D/g, "");
  return `c:${sha256(
    [input.type, phone, stableDetails(input.details), input.note?.trim() ?? "", input.qrData ?? ""].join("|")
  )}`;
}
