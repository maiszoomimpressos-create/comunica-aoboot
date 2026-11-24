/**
 * Pós-corrida: depois do recibo de corrida, o MAIS ZAP manda duas mensagens —
 * a imagem com legenda curta (sem link) e, 3-6 s depois, o convite com o link
 * da Play Store e prévia (ver
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

/** Atraso aleatório entre o recibo e a imagem — 3 a 4,5 minutos. O teto
 * fica abaixo de 5 min porque o envio acontece dentro da própria função do
 * recibo (after(), maxDuration 300 s) — ver scheduleInlineRideFollowUpDispatch. */
export const APP_PROMO_MIN_DELAY_MS = 3 * 60 * 1000;
export const APP_PROMO_MAX_DELAY_MS = 4.5 * 60 * 1000;

export const APP_PROMO_CAPTION_MAX_LENGTH = 1000;
export const APP_PROMO_LINK_TITLE_MAX_LENGTH = 80;
export const APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH = 160;

/** Intervalo entre a imagem e a mensagem com o link — 3 a 6 segundos. */
export const APP_PROMO_LINK_GAP_MIN_MS = 3_000;
export const APP_PROMO_LINK_GAP_MAX_MS = 6_000;

/** 1ª mensagem: legenda da imagem, SEM link (o link vai na 2ª mensagem, com
 * prévia da Play Store). `{{nome_empresa}}` vira o nome do negócio. */
export const DEFAULT_APP_PROMO_CAPTION =
  "Valeu pela corrida! 🚗💛 Da próxima vez, pede direto pelo app da *{{nome_empresa}}*: é mais rápido e você acompanha o motorista em tempo real.";

/** 2ª mensagem: convite curto; o link é sempre colocado no FIM (a Z-API
 * exige o link no fim do texto pra montar a prévia). */
export const DEFAULT_APP_PROMO_LINK_MESSAGE = "Baixa agora, leva 1 minutinho 👇";
export const DEFAULT_APP_PROMO_LINK_TITLE = "{{nome_empresa}}";
export const DEFAULT_APP_PROMO_LINK_DESCRIPTION = "Baixe grátis na Google Play";

export function randomAppPromoDelayMs(): number {
  return APP_PROMO_MIN_DELAY_MS + Math.floor(Math.random() * (APP_PROMO_MAX_DELAY_MS - APP_PROMO_MIN_DELAY_MS + 1));
}

export function randomAppPromoLinkGapMs(): number {
  return (
    APP_PROMO_LINK_GAP_MIN_MS + Math.floor(Math.random() * (APP_PROMO_LINK_GAP_MAX_MS - APP_PROMO_LINK_GAP_MIN_MS + 1))
  );
}

function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Tira o `{{link}}` e qualquer URL http(s) do texto — a legenda da imagem
 * não leva link (ele vai na 2ª mensagem). */
function stripLinks(text: string, link?: string): string {
  let out = text.replaceAll("{{link}}", "");
  if (link) out = out.replaceAll(link, "");
  return out.replace(/https?:\/\/\S+/g, "");
}

/** Legenda final da imagem (1ª mensagem): placeholders trocados e sem link. */
export function renderAppPromoImageCaption(
  template: string | null | undefined,
  { businessName, link }: { businessName: string; link?: string }
): string {
  const base = template?.trim() ? template.trim() : DEFAULT_APP_PROMO_CAPTION;
  const rendered = tidy(stripLinks(base.replaceAll("{{nome_empresa}}", businessName), link));
  return rendered || tidy(DEFAULT_APP_PROMO_CAPTION.replaceAll("{{nome_empresa}}", businessName));
}

/** Texto da 2ª mensagem: convite + o link sempre na última linha. */
export function renderAppPromoLinkMessage(
  template: string | null | undefined,
  { link, businessName }: { link: string; businessName: string }
): string {
  const base = template?.trim() ? template.trim() : DEFAULT_APP_PROMO_LINK_MESSAGE;
  const text = tidy(stripLinks(base.replaceAll("{{nome_empresa}}", businessName), link));
  return text ? `${text}\n${link}` : link;
}

export function renderAppPromoLinkTitle(template: string | null | undefined, businessName: string): string {
  const base = template?.trim() ? template.trim() : DEFAULT_APP_PROMO_LINK_TITLE;
  return base.replaceAll("{{nome_empresa}}", businessName).slice(0, APP_PROMO_LINK_TITLE_MAX_LENGTH);
}

export function renderAppPromoLinkDescription(template: string | null | undefined, businessName: string): string {
  const base = template?.trim() ? template.trim() : DEFAULT_APP_PROMO_LINK_DESCRIPTION;
  return base.replaceAll("{{nome_empresa}}", businessName).slice(0, APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH);
}
