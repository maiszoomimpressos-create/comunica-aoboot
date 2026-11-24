/**
 * Origem (canal) do pedido de uma corrida, informada pelo MAI Drive junto do
 * recibo (`corrida_concluida` / `corrida_mai_drive`). Decide se, depois do
 * recibo, o passageiro recebe divulgação do app (imagem da Play Store e
 * Publicidades): quem pediu pelo app do passageiro já tem o app, então não
 * recebe; quem pediu pela maçaneta, pelo motorista ou pelo WhatsApp recebe.
 *
 * O payload do MAI Drive até 24/11/2026 NÃO tinha esse campo (os details do
 * recibo trazem distância, valores, horários, motorista, pagamento, links —
 * e `origem`/`destino`, que são ENDEREÇOS, não o canal do pedido). Por isso
 * o campo é novo e opcional — ver docs/RECIBO-ORIGEM-DO-PEDIDO.md:
 *   - no corpo: `requestSource` (preferido), ou
 *   - dentro de `details`: `canal_pedido` (ou `origem_pedido`).
 * Ausente/vazio → `null` → envia (comportamento de antes).
 */

export type RideRequestSource = "app" | "whatsapp" | "motorista" | "macaneta" | "outro";

/** Chaves aceitas dentro de `details` (o corpo `requestSource` tem prioridade). */
export const RIDE_REQUEST_SOURCE_DETAIL_KEYS = ["canal_pedido", "origem_pedido"] as const;

const ALIASES: Record<string, RideRequestSource> = {
  app: "app",
  aplicativo: "app",
  app_passageiro: "app",
  aplicativo_passageiro: "app",
  passageiro_app: "app",
  passenger_app: "app",
  passageiro: "app",
  whatsapp: "whatsapp",
  whats: "whatsapp",
  wpp: "whatsapp",
  zap: "whatsapp",
  bot: "whatsapp",
  mais_zap: "whatsapp",
  maiszap: "whatsapp",
  motorista: "motorista",
  driver: "motorista",
  app_motorista: "motorista",
  driver_app: "motorista",
  macaneta: "macaneta",
  rua: "macaneta",
  street: "macaneta",
  offline: "macaneta",
  offline_manual: "macaneta",
};

/** "App Passageiro", "MAÇANETA", "offline-manual" → valor canônico.
 * Vazio/ausente → null. Texto desconhecido → "outro" (não é app → envia). */
export function normalizeRideRequestSource(raw: string | null | undefined): RideRequestSource | null {
  if (typeof raw !== "string") return null;
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!key) return null;
  return ALIASES[key] ?? "outro";
}

export function resolveRideRequestSource(input: {
  requestSource?: string | null;
  details?: Record<string, string> | null;
}): RideRequestSource | null {
  const fromBody = normalizeRideRequestSource(input.requestSource);
  if (fromBody) return fromBody;
  for (const key of RIDE_REQUEST_SOURCE_DETAIL_KEYS) {
    const fromDetails = normalizeRideRequestSource(input.details?.[key]);
    if (fromDetails) return fromDetails;
  }
  return null;
}

/** Só a origem "app" bloqueia a divulgação; ausente (null) envia, como antes. */
export function rideAllowsPromotions(source: RideRequestSource | null): boolean {
  return source !== "app";
}

/**
 * O que sai depois de um envio com sucesso:
 *  - recibo de corrida pedida pelo app → nem imagem da Play Store, nem Publicidade;
 *  - recibo de corrida de outra origem (ou sem origem) → imagem da Play Store se
 *    o card estiver ligado; a Publicidade só se a imagem NÃO estiver ligada
 *    (nunca as duas);
 *  - qualquer outra função → Publicidade como sempre (sem imagem da Play Store).
 */
export function planPostNotificationPromotions(input: {
  isRideReceipt: boolean;
  source: RideRequestSource | null;
  appPromoActive: boolean;
}): { scheduleAppPromo: boolean; queueAdvertisement: boolean } {
  if (!input.isRideReceipt) return { scheduleAppPromo: false, queueAdvertisement: true };
  if (!rideAllowsPromotions(input.source)) return { scheduleAppPromo: false, queueAdvertisement: false };
  return { scheduleAppPromo: input.appPromoActive, queueAdvertisement: !input.appPromoActive };
}
