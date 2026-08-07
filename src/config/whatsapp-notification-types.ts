import { ValidationError } from "@/lib/server/errors";

/**
 * Catalog of WhatsApp notification types the purchase-confirmation API
 * supports — same philosophy as WHATSAPP_PRODUCTS and the provider
 * abstraction: a small, curated, code-owned list (never free text from the
 * caller) so message wording stays consistent, with adding a new niche's
 * notification type being a one-entry addition here, not a new endpoint.
 *
 * Each type owns its own message template and declares what it needs:
 * `requiresQr` gates whether `qrData` is mandatory in the request (tickets,
 * parking vouchers — anything meant to be scanned); `requiredDetailKeys`
 * gates which free-form `details` keys must be present (e.g. an
 * appointment needs a date/time that nothing else does).
 */

export interface NotificationDetails {
  [key: string]: string;
}

export interface BuildMessageInput {
  /** The recipient's own WhatsApp display name — best-effort, see
   * ZApiProvider.getContactName. Null when unavailable; templates must
   * greet generically in that case. */
  whatsappName: string | null;
  /** The name registered for this person in the caller's own system —
   * never the WhatsApp profile name (see whatsapp-connection.service.ts
   * for why both matter). */
  recipientName: string;
  /** Tenant's configured business name (Minha Empresa), falls back to the
   * tenant's regular name — resolved by the caller before invoking this. */
  businessName: string;
  details: NotificationDetails;
}

export interface NotificationTypeDef {
  key: string;
  label: string;
  requiresQr: boolean;
  requiredDetailKeys: string[];
  buildMessage(input: BuildMessageInput): string;
}

function greet(whatsappName: string | null): string {
  return whatsappName ? `Olá, ${whatsappName}!` : "Olá!";
}

export const DEFAULT_NOTIFICATION_TYPE = "compra_confirmada";

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  {
    key: "compra_confirmada",
    label: "Compra confirmada",
    requiresQr: false,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, recipientName, businessName }) =>
      `${greet(whatsappName)} O pedido comprado em ${businessName}, por ${recipientName}, foi aprovado com sucesso.`,
  },
  {
    key: "ingresso_emitido",
    label: "Ingresso emitido",
    requiresQr: true,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, recipientName, businessName }) =>
      `${greet(whatsappName)} Seu ingresso da compra em ${businessName}, por ${recipientName}, foi aprovado com sucesso.`,
  },
  {
    key: "estacionamento_emitido",
    label: "Comprovante de estacionamento emitido",
    requiresQr: true,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, recipientName, businessName }) =>
      `${greet(whatsappName)} Seu comprovante de estacionamento em ${businessName}, por ${recipientName}, foi aprovado com sucesso.`,
  },
  {
    key: "lista_espera",
    label: "Entrada na lista de espera",
    requiresQr: false,
    requiredDetailKeys: [],
    buildMessage: ({ whatsappName, businessName }) =>
      `${greet(whatsappName)} Você entrou na lista de espera em ${businessName}. Assim que houver uma vaga, avisamos por aqui.`,
  },
  {
    key: "agendamento_confirmado",
    label: "Agendamento confirmado",
    requiresQr: false,
    requiredDetailKeys: ["data", "horario"],
    buildMessage: ({ whatsappName, businessName, details }) =>
      `${greet(whatsappName)} Seu agendamento em ${businessName} foi confirmado para ${details.data} às ${details.horario}.`,
  },
];

/** Resolves a type key to its definition — `undefined` falls back to the
 * generic default (compra_confirmada), matching the API's pre-catalog
 * behavior for callers that don't send `type` at all. Throws for an
 * unknown key rather than silently falling back, so a typo in the
 * caller's integration surfaces immediately instead of sending the wrong
 * message. */
export function getNotificationType(key: string | undefined): NotificationTypeDef {
  const resolved = key?.trim() || DEFAULT_NOTIFICATION_TYPE;
  const found = NOTIFICATION_TYPES.find((t) => t.key === resolved);
  if (!found) {
    throw new ValidationError(
      `Tipo de notificação inválido: "${resolved}". Tipos disponíveis: ${NOTIFICATION_TYPES.map((t) => t.key).join(", ")}.`
    );
  }
  return found;
}
