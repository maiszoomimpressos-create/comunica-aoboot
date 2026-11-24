/**
 * Pós-corrida: depois do recibo `corrida_concluida`, o MAIS ZAP manda uma
 * imagem com o link do app na Play Store (ver
 * ride-receipt-follow-up.service.ts). Constantes e montagem da legenda
 * ficam aqui pra servir tanto o painel (client) quanto o envio (server).
 */

/** Tipo fixo do recibo de corrida (catálogo whatsapp-notification-types.ts). */
export const RIDE_RECEIPT_NOTIFICATION_TYPE = "corrida_concluida";

/** Recibos de corrida cujo envio com sucesso agenda a imagem do app: o tipo
 * fixo `corrida_concluida` e a função personalizada `corrida_mai_drive`
 * (payload novo do MAI Drive, que substitui o antigo). */
export const RIDE_RECEIPT_NOTIFICATION_TYPES: readonly string[] = [RIDE_RECEIPT_NOTIFICATION_TYPE, "corrida_mai_drive"];

export function isRideReceiptNotificationType(key: string | null | undefined): boolean {
  return !!key && RIDE_RECEIPT_NOTIFICATION_TYPES.includes(key);
}

/** Atraso aleatório entre o recibo e a imagem — 3 a 5 minutos. */
export const APP_PROMO_MIN_DELAY_MS = 3 * 60 * 1000;
export const APP_PROMO_MAX_DELAY_MS = 5 * 60 * 1000;

export const APP_PROMO_CAPTION_MAX_LENGTH = 1000;

/** Legenda usada quando o tenant não escreve a sua. `{{link}}` vira o link
 * da Play Store e `{{nome_empresa}}` o nome do negócio da conexão. */
export const DEFAULT_APP_PROMO_CAPTION =
  "📲 Que tal pedir a próxima corrida direto pelo app da *{{nome_empresa}}*? É rápido e prático.\n\nBaixe agora na Play Store:\n{{link}}";

export function randomAppPromoDelayMs(): number {
  return APP_PROMO_MIN_DELAY_MS + Math.floor(Math.random() * (APP_PROMO_MAX_DELAY_MS - APP_PROMO_MIN_DELAY_MS + 1));
}

/** Monta a legenda final: troca os placeholders e garante que o link sempre
 * vá na mensagem — se o texto do tenant não tiver `{{link}}`, ele é
 * acrescentado no fim. */
export function renderAppPromoCaption(
  template: string | null | undefined,
  { link, businessName }: { link: string; businessName: string }
): string {
  const base = template?.trim() ? template.trim() : DEFAULT_APP_PROMO_CAPTION;
  const hasLinkPlaceholder = base.includes("{{link}}");
  const rendered = base.replaceAll("{{nome_empresa}}", businessName).replaceAll("{{link}}", link);
  return hasLinkPlaceholder ? rendered : `${rendered}\n\n${link}`;
}
